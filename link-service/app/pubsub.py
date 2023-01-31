import asyncio
import datetime
from bson.objectid import ObjectId
from contextlib import asynccontextmanager
from .schema import query_access

class PubSub:

    def __init__(self, db):
        self.db = db

        self.tag_to_sockets = {} # tag -> set(socket_id)

        self.resume_token = None
        self.restart_watcher()

    def restart_watcher(self):
        if hasattr(self, 'watch_task'):
            self.watch_task.cancel()
        self.watch_task = asyncio.create_task(self.watch())

    @asynccontextmanager
    async def register(self, socket):
        socket.tags = set()

        try:
            yield
        finally:
            # Remove all references to the socket
            for tag in socket.tags:
                self.tag_to_sockets[tag].remove(socket)
                if not self.tag_to_sockets[tag]:
                    del self.tag_to_sockets[tag]
                    self.restart_watcher()

    async def subscribe(self, tags_since, socket):
        for tag, since in tags_since:
            if tag in socket.tags:
                raise Exception(f"you are already subscribed to the tag {tag}")

        for tag, since in tags_since:
            socket.tags.add(tag)
            if tag not in self.tag_to_sockets:
                self.tag_to_sockets[tag] = { socket }
                self.restart_watcher()
            else:
                self.tag_to_sockets[tag].add(socket)

        # In the background, begin processing existing results
        asyncio.create_task(self.process_existing(tags_since, socket))

        return 'subscribed'

    async def unsubscribe(self, tags, socket):
        for tag in tags:
            if tag not in socket.tags:
                raise Exception(f"you are not subscribed to the tag {tag}")

        for tag in tags:
            socket.tags.remove(tag)
            self.tag_to_sockets[tag].remove(socket)
            if not self.tag_to_sockets[tag]:
                del self.tag_to_sockets[tag]
                self.restart_watcher()

        return 'unsubscribed'

    # Initialize database interfaces
    async def watch(self):

        tags_query = { "$elemMatch": { "$in": list(self.tag_to_sockets.keys()) }}
        async with self.db.watch(
                [ { '$match' : { '$or': [
                    { 'fullDocument._tags': tags_query },
                    { 'fullDocumentBeforeChange._tags': tags_query }
                ]}}],
                full_document='whenAvailable',
                full_document_before_change='whenAvailable',
                resume_after=self.resume_token) as stream:

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
                    self.collect_tasks(doc, tasks, msg, done_sockets, now)
                if 'fullDocumentBeforeChange' in change:
                    doc = change['fullDocumentBeforeChange']
                    msg = { "remove": doc["_key"] }
                    self.collect_tasks(doc, tasks, msg, done_sockets, now)

                # Send the changes
                await asyncio.shield(asyncio.gather(*tasks))

                self.resume_token = stream.resume_token

    def collect_tasks(self, doc, tasks, msg, done_sockets, now):
        denied_sockets = set()

        for tag in doc["_tags"]:
            if tag not in self.tag_to_sockets: continue

            # Ignore sockets that have already
            # been considered for sending
            for socket in self.tag_to_sockets[tag] - done_sockets - denied_sockets:

                # Manually check for access permissions
                if '_to' not in doc or \
                    socket.owner_id == doc['_by'] or \
                    socket.owner_id in doc['_to']:

                    tasks.append(socket.send_json( msg | {
                        "now": now,
                        "historical": False
                    }))

                    done_sockets.add(socket)

                else:
                    denied_sockets.add(socket)

    async def process_existing(self, tags_since, socket):
        
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
            "$and": [query_access(socket.owner_id), {
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
                    "now": str(now),
                    "historical": True})
            except Exception as e:
                break

        else:
            await socket.send_json({ "tagsSince": tags_since })
