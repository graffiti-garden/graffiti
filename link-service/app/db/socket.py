from os import getenv
import asyncio
import time

heartbeat_interval = float(getenv('SOCKET_HEARTBEAT'))

class QuerySocket:

    def __init__(self, signature, ws):
        self.signature = signature
        self.ws = ws # Websocket
        self.alive = True

    async def send_msg(self, msg):
        if self.alive:
            try:
                await self.ws.send_json(msg)
            except Exception as e:
                self.alive = False

    async def heartbeat(self, socket_id):
        # Accept the connection
        await self.ws.accept()

        # Send a heartbeat
        while self.alive:
            await self.send_msg({
                'type': 'Ping',
                'socket_id': socket_id,
                # Timestamp in milliseconds to be
                # consistent with JS's Date.now()
                'timestamp': int(time.time() * 1000)
                })
            await asyncio.sleep(heartbeat_interval)

    async def update(self, query_id, doc):
        await self.send_msg({
            'type': 'Update',
            'query_id': query_id,
            'object': doc['object'][0],
            'contexts': doc['contexts'],
            'access': doc['access']
        })

    async def delete(self, query_id, object_id):
        await self.send_msg({
            'type': 'Delete',
            'query_id': query_id,
            'object_id': object_id
        })
