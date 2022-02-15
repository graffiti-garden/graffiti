from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

def get_db():
    # Connect to the database
    client = AsyncIOMotorClient('mongo')
    client.get_io_loop = asyncio.get_running_loop
    return client.test2.objects
