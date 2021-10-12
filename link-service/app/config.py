import aioredis

URL_SIZE = 20
ATTEND_INTERVAL = 5000

async def open_redis():
    return await aioredis.from_url("redis://redis")
