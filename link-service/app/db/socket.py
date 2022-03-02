from os import getenv
import asyncio
from uuid import uuid4

heartbeat_interval = float(getenv('QUERY_HEARTBEAT'))

class QuerySocket:

    def __init__(self, signature, ws, qb):
        self.signature = signature
        self.ws = ws # Websocket
        self.qb = qb # QueryBroker
        self.alive = True
        self.id = str(uuid4())

    async def send_msg(self, msg):
        if self.alive:
            try:
                await self.ws.send_json(msg)
            except Exception as e:
                await self.qb.remove_socket(self)
                self.alive = False

    async def heartbeat(self):
        # Accept the connection
        await self.ws.accept()

        # Register ourselves with the query process
        await self.qb.add_socket(self)

        # Send a heartbeat
        while self.alive:
            await self.send_msg({
                'type': 'Ping',
                'socket_id': self.id
                })
            await asyncio.sleep(heartbeat_interval)

    async def update(self, query_id, doc):
        await self.send_msg({
            'type': 'Update',
            'query_id': query_id,
            'object': doc['object'][0],
            'near_misses': doc['near_misses'],
            'access': doc['access']
        })

    async def delete(self, query_id, object_id):
        await self.send_msg({
            'type': 'Delete',
            'query_id': query_id,
            'object_id': object_id
        })

    async def error(self, query_id, detail):
        await self.send_msg({
            'type': 'Reject',
            'query_id': query_id,
            'content': detail
        })
