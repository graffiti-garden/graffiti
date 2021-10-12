import aioredis

async def open_redis():
    return await aioredis.from_url("redis://redis")
