PACKAGE = "theater"

POD_URL_SIZE = 20

ATTEND_WS_INTERVAL = 5000

MAIL_FROM = "Theater <noreply@theater.csail.mit.edu>"
MAIL_HOST = "mailserver"
MAIL_PORT = 25

import aioredis
async def open_redis():
    return await aioredis.from_url("redis://redis")
