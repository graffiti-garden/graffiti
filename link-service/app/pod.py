import random
import string
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File
from .config import POD_URL_SIZE, open_redis
from .login import token_to_user

router = APIRouter(prefix='/pod')

@router.post('/alloc')
async def alloc(user: str = Depends(token_to_user)):
    # Create a random URL
    url = ''.join(random.choice(string.ascii_letters) for _ in range(POD_URL_SIZE))

    # Add the user to it
    r = await open_redis()
    await r.hset('url' + url, 'user', user)

    return {'url': url}

@router.put('/{url}')
async def put(
        url: str,
        user: str = Depends(token_to_user),
        data: UploadFile = File(...)):

    # Connect to the database
    r = await open_redis()

    # Make sure the URL is assigned to the user
    owner = await r.hget('url' + url, 'user')
    if not owner or user != owner.decode():
        raise HTTPException(status_code=403, detail=f"{user} doesn't have permission to write to {url}")

    # Set the data
    media_type = mimetypes.guess_type(data.filename)[0]
    if not media_type:
        media_type = "application/octet-stream"
    await r.hset('url' + url, 'media_type', media_type)
    datab = await data.read()
    await r.hset('url' + url, 'data', datab)

    return "Success"

@router.get('/{url}')
async def get(url: str):

    # Connect to the database
    r = await open_redis()

    # Check if the URL exists
    if not await r.hexists('url' + url, 'data'):
        print("nope")
        raise HTTPException(status_code=404, detail="Not Found")

    # Fetch the data
    datab      = await r.hget('url' + url, 'data')
    media_type = (await r.hget('url' + url, 'media_type')).decode()

    return Response(datab, media_type=media_type)

@router.delete('/{url}')
async def delete(url: str, user = Depends(token_to_user)):

    # Connect to the database
    r = await open_redis()

    # Make sure it is owned by the user
    owner = await r.hget('url' + url, 'user')
    if not owner or user != owner.decode():
        raise HTTPException(status_code=403, detail=f"{user} doesn't have permission to delete {url}")

    # Delete the data and mimetype (keep ownership)
    await r.hdel('url' + url, 'data', 'mimetype')

    return "Success"
