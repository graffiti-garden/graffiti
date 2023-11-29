#!/usr/bin/env python3

import asyncio
from time import time
from motor.motor_asyncio import AsyncIOMotorClient

EXPIRATION_INTERVAL = 2 # seconds

async def db_intialize():
    client = AsyncIOMotorClient('mongo')
    if 'links' not in await client.graffiti.list_collection_names():
        await client.graffiti.create_collection(
            'links',
            changeStreamPreAndPostImages={'enabled': True})

    db = client.graffiti.links

    # Create indexes if they don't already exist
    await db.create_index('editor_public_key', unique=True)
    await db.create_index('info_hash')
    await db.create_index('expiration')

    # Start the expiration task
    asyncio.create_task(expire())

async def expire():
    # Every n seconds, clear expired links
    while True:
        await db_connection().delete_many({
            'expiration': { '$lte': time() }
        })
        await asyncio.sleep(EXPIRATION_INTERVAL)

def db_connection():
    return AsyncIOMotorClient('mongo').graffiti.links