import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from .schema import query_access

class PubSub:

    def __init__(self, db):
        self.db = db

        self.tag_to_sockets = {} # tag -> set(socket)

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

    async def subscribe(self, tags, socket):
        for tag in tags:
            if tag in socket.tags:
                raise Exception(f"you are already subscribed to the tag {tag}")

        for tag in tags:
            socket.tags.add(tag)
            if tag not in self.tag_to_sockets:
                self.tag_to_sockets[tag] = { socket }
                self.restart_watcher()
            else:
                self.tag_to_sockets[tag].add(socket)

        # In the background, begin processing existing results
        asyncio.create_task(self.process_existing(tags, socket))

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
                tasks = []

                # Create a set of tasks for sending
                # messages to relevant sockets
                tags_new = denied_sockets = []
                if 'fullDocument' in change:
                    obj = change['fullDocument']
                    tags_new = obj["_tags"]
                    del obj['_id']
                    denied_sockets = self.collect_tasks(obj, tasks, "update")

                if 'fullDocumentBeforeChange' in change:

                    obj = change['fullDocumentBeforeChange']
                    obj = {
                        "_key": obj["_key"],
                        "_by": obj["_by"],
                        "_tags": obj["_tags"]
                    }

                    # If users have permission to see the old
                    # object but not the new, send a removal
                    for socket in denied_sockets:
                        self.task_with_permission(socket, obj, tasks, "remove")

                    # Now only consider old tags and don't consider denied sockets
                    obj["_tags"] = list(set(obj["_tags"]) - set(tags_new))
                    self.collect_tasks(obj, tasks, "remove", done_sockets=denied_sockets)

                # Send the changes
                await asyncio.shield(asyncio.gather(*tasks))
                self.resume_token = stream.resume_token

    def collect_tasks(self, obj, tasks, msg, done_sockets=None):
        if not done_sockets: done_sockets = set()
        denied_sockets = set()

        for tag in obj["_tags"]:
            if tag not in self.tag_to_sockets: continue

            # Ignore sockets that have already
            # been considered for sending
            for socket in self.tag_to_sockets[tag] - done_sockets:
                done_sockets.add(socket)
                if not self.task_with_permission(socket, obj, tasks, msg):
                    denied_sockets.add(socket)

        return denied_sockets

    def task_with_permission(self, socket, obj, tasks, msg):
        has_permission = '_to' not in obj or \
            socket.owner_id == obj['_by'] or \
            socket.owner_id in obj['_to']

        if has_permission:
            tasks.append(socket.send_json({msg: obj, "historical": False}))
        return has_permission

    async def process_existing(self, tags, socket):
        
        query = query_access(socket.owner_id) | \
            { "_tags": { "$elemMatch": { "$in": tags } } }

        async for obj in self.db.find(query):
            del obj["_id"]
            try:
                await socket.send_json({ "update": obj, "historical": True })
            except Exception as e:
                break
