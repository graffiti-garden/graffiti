import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from .schema import query_access

class PubSub:

    def __init__(self, db):
        self.db = db

        self.context_to_sockets = {} # context -> set(socket)

        self.resume_token = None
        self.restart_watcher()

    def restart_watcher(self):
        if hasattr(self, 'watch_task'):
            self.watch_task.cancel()
        self.watch_task = asyncio.create_task(self.watch())

    @asynccontextmanager
    async def register(self, socket):
        socket.contexts = set()

        try:
            yield
        finally:
            # Remove all references to the socket
            for context in socket.contexts:
                self.context_to_sockets[context].remove(socket)
                if not self.context_to_sockets[context]:
                    del self.context_to_sockets[context]
                    self.restart_watcher()

    async def subscribe(self, contexts, socket):
        for context in contexts:
            if context in socket.contexts:
                raise Exception(f"you are already subscribed to the context {context}")

        for context in contexts:
            socket.contexts.add(context)
            if context not in self.context_to_sockets:
                self.context_to_sockets[context] = { socket }
                self.restart_watcher()
            else:
                self.context_to_sockets[context].add(socket)

        # In the background, begin processing existing results
        asyncio.create_task(self.process_existing(contexts, socket))

        return 'subscribed'

    async def unsubscribe(self, contexts, socket):
        for context in contexts:
            if context not in socket.contexts:
                raise Exception(f"you are not subscribed to the context {context}")

        for context in contexts:
            socket.contexts.remove(context)
            self.context_to_sockets[context].remove(socket)
            if not self.context_to_sockets[context]:
                del self.context_to_sockets[context]
                self.restart_watcher()

        return 'unsubscribed'

    # Initialize database interfaces
    async def watch(self):

        contexts_query = { "$elemMatch": { "$in": list(self.context_to_sockets.keys()) }}
        async with self.db.watch(
                [ { '$match' : { '$or': [
                    { 'fullDocument.context': contexts_query },
                    { 'fullDocumentBeforeChange.context': contexts_query }
                ]}}],
                full_document='whenAvailable',
                full_document_before_change='whenAvailable',
                resume_after=self.resume_token) as stream:

            async for change in stream:
                tasks = []

                # Create a set of tasks for sending
                # messages to relevant sockets
                contexts_new = denied_sockets = []
                if 'fullDocument' in change:
                    obj = change['fullDocument']
                    contexts_new = obj["context"]
                    del obj['_id']
                    denied_sockets = self.collect_tasks(obj, tasks, "update")

                if 'fullDocumentBeforeChange' in change:

                    obj = change['fullDocumentBeforeChange']
                    obj = {
                        "id": obj["id"],
                        "actor": obj["actor"],
                        "context": obj["context"]
                    }

                    # If users have permission to see the old
                    # object but not the new, send a removal
                    for socket in denied_sockets:
                        self.task_with_permission(socket, obj, tasks, "remove")

                    # Now only consider old contexts and don't consider denied sockets
                    obj["context"] = list(set(obj["context"]) - set(contexts_new))
                    self.collect_tasks(obj, tasks, "remove", done_sockets=denied_sockets)

                # Send the changes
                await asyncio.shield(asyncio.gather(*tasks))
                self.resume_token = stream.resume_token

    def collect_tasks(self, obj, tasks, msg, done_sockets=None):
        if not done_sockets: done_sockets = set()
        denied_sockets = set()

        for context in obj["context"]:
            if context not in self.context_to_sockets: continue

            # Ignore sockets that have already
            # been considered for sending
            for socket in self.context_to_sockets[context] - done_sockets:
                done_sockets.add(socket)
                if not self.task_with_permission(socket, obj, tasks, msg):
                    denied_sockets.add(socket)

        return denied_sockets

    def task_with_permission(self, socket, obj, tasks, msg):
        has_permission = socket.actor == obj['actor'] or \
            (('bto' not in obj) and ('bcc' not in obj)) or \
            ('bto' in obj and socket.actor in obj['bto']) or \
            ('bcc' in obj and socket.actor in obj['bcc'])

        if has_permission:
            tasks.append(socket.send_json({msg: obj, "historical": False}))
        return has_permission

    async def process_existing(self, contexts, socket):
        
        query = query_access(socket.actor) | \
            { "context": { "$elemMatch": { "$in": contexts } } }

        async for obj in self.db.find(query):
            del obj["_id"]
            try:
                await socket.send_json({ "update": obj, "historical": True })
            except Exception as e:
                break
