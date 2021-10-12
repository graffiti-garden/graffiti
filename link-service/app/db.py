import os
import aioredis

r = os.getenv('REDIS_HOST')
async def open_redis():
    return await aioredis.from_url("redis://" + r)
