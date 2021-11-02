import aioredis
from hashlib import sha256
from os import getenv
from typing import List

async def open_redis():
    return await aioredis.from_url("redis://redis")

"""
Combine a set of strings into a unique and secret hash.
"""
secret = getenv('SECRET')
def strings_to_hash(strings: List[str]):
    # Put the secret between the strings to
    # prevent ambiguity where they join and
    # also to prevent this function from being
    # publicly computable.
    inp = secret.join(strings)
    return sha256(inp.encode()).digest()
