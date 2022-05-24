#!/usr/bin/env python3

import asyncio
from utils import *

async def main():

    my_id, my_token = id_and_token()
    async with websocket_connect(my_token) as ws:
        # Try adding an object
        await send(ws, {
            'messageID': random_id(),
            'type': 'subscribe',
            'query': {}
        })
        result = await recv(ws)
        print(result)
        result = await recv(ws)
        print(result)

if __name__ == "__main__":
    asyncio.run(main())
