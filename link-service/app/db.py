#!/usr/bin/env python3

from motor.motor_asyncio import AsyncIOMotorClient

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

def db_connection():
    return AsyncIOMotorClient('mongo').graffiti.links