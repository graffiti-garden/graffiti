from motor.motor_asyncio import AsyncIOMotorClient

async def get_db():
    # Connect to the database
    client = AsyncIOMotorClient('mongo')
    db = client.test3.objects

    # Create indexes if they don't already exist
    await db.create_index('obj.uuid')
    await db.create_index('obj.created')
    await db.create_index('obj.signed')

    return db
