import asyncio
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient

class Tracker:

    def __init__(self):
        self.peers = set()
        self.subscriptions = {} # info_hash -> set(socket)

    async def initialize(self, client):
        if 'announces' not in await client.graffiti.list_collection_names():
            await client.graffiti.create_collection(
                'announces',
                changeStreamPreAndPostImages={'enabled': True})

        self.db = client.graffiti.announces
        await self.db.create_index('peer')
        await self.db.create_index('info_hash')
        self.watch_task = asyncio.create_task(self.watch())

    async def announce(self, info_hashes, socket):
        # Unannounce if already announced
        await self.unannounce(info_hashes, socket)

        # Insert the announces
        await self.db.insert_many([{
            "peer": socket.peer,
            "info_hash": info_hash
        } for info_hash in info_hashes],
        ordered=False)

        return 'announced'

    async def unannounce(self, info_hashes, socket):
        await self.db.delete_many({
            "peer": socket.peer,
            "info_hash": { "$in": info_hashes }
        })

        return 'unannounced'

    async def unannounce_all(self, socket):
        await self.db.delete_many({
            "peer": socket.peer
        })

        return 'unannounced all'

    async def subscribe(self, info_hashes, socket):
        for info_hash in info_hashes:
            socket.subscriptions.add(info_hash)
            if info_hash not in self.subscriptions:
                self.subscriptions[info_hash] = set()
            self.subscriptions[info_hash].add(socket)

        asyncio.create_task(self.process_existing(info_hashes, socket))

        return 'subscribed'

    async def unsubscribe(self, info_hashes, socket):
        for info_hash in info_hashes:
            if info_hash in socket.subscriptions:
                socket.subscriptions.remove(info_hash)
                if info_hash in self.subscriptions:
                    self.subscriptions[info_hash].remove(socket)
                    if not self.subscriptions[info_hash]:
                        del self.subscriptions[info_hash]

        return 'unsubscribed'

    async def unsubscribe_all(self, socket):
        return await self.unsubscribe(
                socket.subscriptions.copy(),
                socket) + ' all'

    @asynccontextmanager
    async def register(self, socket):
        if socket.peer in self.peers:
            raise Exception(f"Peer with ID {socket.peer} already exists")

        self.peers.add(socket.peer)
        socket.subscriptions = set()

        try:
            yield
        finally:
            # Remove all references to the socket
            await self.unsubscribe_all(socket)
            await self.unannounce_all(socket)
            self.peers.remove(socket.peer)

    async def process_existing(self, info_hashes, socket):
        async for obj in self.db.find({"info_hash": { "$in": info_hashes}}):
            try:
                await socket.send_json({
                    "action": "announce",
                    "peer": obj["peer"],
                    "info_hash": obj["info_hash"]
                })
            except Exception as e:
                break

    # Initialize database interfaces
    async def watch(self):
        async with self.db.watch([{'$match' : {}}],
                full_document='whenAvailable',
                full_document_before_change='whenAvailable') as stream:

            async for change in stream:
                if 'fullDocument' in change:
                    obj = change['fullDocument']
                    action = "announce"
                elif 'fullDocumentBeforeChange' in change:
                    obj = change['fullDocumentBeforeChange']
                    action = "unannounce"
                else:
                    continue

                peer = obj["peer"]
                info_hash = obj["info_hash"]

                if info_hash not in self.subscriptions: continue

                tasks = [socket.send_json({
                    "action": action,
                    "peer": peer,
                    "info_hash": info_hash
                }) for socket in self.subscriptions[info_hash]]

                # Send the changes (ignoring failed sends)
                await asyncio.gather(*tasks, return_exceptions=True)
