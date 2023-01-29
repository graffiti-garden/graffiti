import asyncio
import datetime
from bson.objectid import ObjectId
from contextlib import asynccontextmanager
from .schema import query_access

class PubSub:

    def __init__(self, db):
        self.db = db

        self.tags = set()
        self.socket_to_tags = {} # socket_id -> set(tag)
        self.tag_to_sockets = {} # tag -> set(socket_id)

        asyncio.create_task(self.watch())

    @asynccontextmanager
    async def register(self, socket):
        # Allocate space for this socket's subscriptions
        self.socket_to_tags[socket] = set()

        try:
            yield

        finally:
            # Remove all references to the socket
            for tag in self.socket_to_tags[socket]:
                self.tag_to_sockets[tag].remove(socket)
                if not self.tag_to_sockets[tag]:
                    del self.tag_to_sockets[tag]
                    self.tags.remove(tag)
                    self.tags_updated = True
            del self.socket_to_tags[socket]

    async def subscribe(self, tags_since, socket, owner_id):
        for tag, since in tags_since:
            if tag in self.socket_to_tags[socket]:
                raise Exception(f"you are already subscribed to the tag {tag}")

        for tag, since in tags_since:
            self.socket_to_tags[socket].add(tag)
            if tag not in self.tag_to_sockets:
                self.tag_to_sockets[tag] = set()
                self.tags.add(tag)
                self.tags_updated = True
            self.tag_to_sockets[tag].add(socket)

        # In the background, begin processing existing results
        asyncio.create_task(self.process_existing(tags_since, socket, owner_id))

        return 'subscribed'

    async def unsubscribe(self, tags, socket, owner_id):
        for tag in tags:
            if tag not in self.socket_to_tags[socket]:
                raise Exception(f"you are not subscribed to the tag {tag}")

        for tag in tags:
            self.socket_to_tags[socket].remove(tag)
            self.tag_to_sockets[tag].remove(socket)
            if not self.tag_to_sockets[tag]:
                self.tags.remove(tag)
                self.tags_updated = True
                del self.tag_to_sockets[tag]

        return 'unsubscribed'

    # Initialize database interfaces
    async def watch(self):

        resume_token = None

        while True:

            self.tags_updated = False
        
            async with self.db.watch(
                    [ { '$match' : {'fullDocument._tags': { "$elemMatch": { "$in": list(self.tags) }}}}],
                    full_document='whenAvailable',
                    full_document_before_change='whenAvailable') as stream:

                async for change in stream:

                    now = change['_id']
                    done_sockets = set()
                    tasks = []

                    # Create a set of tasks for sending
                    # messages to relevant sockets
                    if 'fullDocument' in change:
                        doc = change['fullDocument']
                        del doc['_id']
                        msg = { "update": doc }
                        self.collect_tasks(doc, tasks, msg, done_sockets, now, owner_id)
                    if 'fullDocumentBeforeChange' in change:
                        doc = change['fullDocumentBeforeChange']
                        msg = { "remove": doc["_key"] }
                        self.collect_tasks(doc, tasks, msg, done_sockets, now, owner_id)

                    # Do the tasks
                    await asyncio.gather(*tasks)
                    
                    # Check for new subscriptions
                    if self.tags_updated:
                        resume_token = stream.resume_token
                        break

    def collect_tasks(self, doc, tasks, msg, done_sockets, now, owner_id):

        for tag in doc["_tags"]:
            if not self.tag_to_sockets[tag]: continue
            for socket in self.tag_to_sockets[tag] - done_sockets:
                done_sockets.add(socket)
                if '_to' not in doc or owner_id == doc['_by'] or owner_id in doc['_to']:
                    tasks.append(socket.send_json( msg | { "now": now }))

    async def process_existing(self, tags_since, socket, owner_id):
        
        # Formulate a query for each tag and time pair
        tags_since_queries = []
        for (tag, since) in tags_since:
            if since:
                since = ObjectId(since)
            else:
                # woo Y2K!
                since = ObjectId.from_datetime(datetime.datetime(2000,1,1))

            tags_since_queries.append({
                "_tags": tag,
                "_id": { "$gt": since }
            })

        query = {
            # Only get objects prior to subscription
            "$and": [query_access(owner_id), {
                "$or": tags_since_queries
            }]
        }

        now = None
        async for object in self.db.find(query, sort=[('_id', -1)]):
            if not now:
                now = object["_id"]

            try:
                del object["_id"]
                await socket.send_json({
                    "update": object,
                    "now": str(now)})
            except Exception as e:
                break

        await socket.send_json({ "tagsSince": tags_since })
