import time
from uuid import uuid4
from os import getenv
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, Depends, WebSocket, HTTPException, Body
from ..token import token_to_signature
from .broker import QueryBroker
from .socket import QuerySocket
from .rewrite import object_rewrite, query_rewrite

max_limit = float(getenv('QUERY_LIMIT'))

router = APIRouter()

client = AsyncIOMotorClient('mongo')
db = client.graffiti.objects
qb = QueryBroker(db)

@router.on_event("startup")
async def start_query_sockets():
    client.get_io_loop = asyncio.get_running_loop

    # Create indexes for common fields if
    # they don't already exist.
    await db.create_index('object.id')
    await db.create_index('object.signature')
    await db.create_index('object.timestamp')
    await db.create_index('object.tags')

@router.post('/insert')
async def insert(
        object: dict,
        near_misses: list[dict] = [],
        access: list[str]|None = None,
        signature: str = Depends(token_to_signature)):

    # Sign the object
    object['id'] = str(uuid4())
    doc = object_rewrite(object, near_misses, access, signature)

    # Insert it into the database
    await db.insert_one(doc)

    # Propagate the insertion to socket queries
    await qb.change(object['id'])

    return object['id']

@router.post('/replace')
async def replace(
        object: dict,
        near_misses: list[dict] = [],
        access: list[str]|None = None,
        signature: str = Depends(token_to_signature)):

    # Check that the object that already exists
    # and that it is owned by the signer
    old_doc = await db.find_one({
        "object.id": object['id'],
        "object.signature": signature})
    if not old_doc:
        raise HTTPException(status_code=400, detail="The object you're trying to replace either doesn't exist or you don't have permission to replace it.")

    # Rewrite the new document
    new_doc = object_rewrite(object, near_misses, access, signature)

    # Replace the old document with the new
    await db.replace_one({"object.id": object['id']}, new_doc)

    # Propagate the replace to socket queries
    await qb.change(object['id'])

    return object['id']

@router.post('/delete')
async def delete(
        object_id: str = Body(..., embed=True),
        signature: str = Depends(token_to_signature)):

    # Check that the object that already exists
    # and that it is owned by the signer
    old_doc = await db.find_one({
        "object.id": object_id,
        "object.signature": signature})
    if not old_doc:
        raise HTTPException(status_code=400, detail="The object you're trying to delete either doesn't exist or you don't have permission to replace it.")

    # Propagate the deletion to socket queries
    await qb.change(object_id, delete=True)

    # Perform deletion
    await db.delete_one({"object.id": object_id})

    return object_id

@router.post("/query_many")
async def query_many(
        query: dict,
        limit: int = Body(..., gt=0, le=max_limit),
        sort: list[tuple[str,int]] = [('object.timestamp', -1), ('object.id', -1)],
        signature: str = Depends(token_to_signature)):

    # Do rewriting for near misses and access control
    query = query_rewrite(query, signature)

    # Perform the query
    try:
        cursor = db.find(
                query,
                sort=sort,
                limit=limit)
        results = await cursor.to_list(length=limit)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    await cursor.close()
    results = [{
        'object': r['object'][0],
        'near_misses': r['near_misses'],
        'access': r['access']
        } for r in results]

    return results

@router.post("/query_one")
async def query_one(
        query: dict,
        sort: list[tuple[str,int]] = [('object.timestamp', -1), ('object.id', -1)],
        signature: str = Depends(token_to_signature)):

    results = await query_many(query, 1, sort, signature)

    if results:
        return results[0]
    else:
        return None

@router.websocket("/query_socket")
async def query_socket(ws: WebSocket, token: str):
    # Validate and convert the token to a signature
    signature = token_to_signature(token)

    # Open a query socket
    qs = QuerySocket(signature, ws, qb)

    # Wait until it dies
    await qs.heartbeat()

@router.post('/query_socket_add')
async def query_socket_add(
        query: dict,
        query_id: str = Body(...),
        socket_id: str = Body(...),
        signature: str = Depends(token_to_signature)):

    try:
        await qb.add_query(socket_id, query_id, query, signature)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post('/query_socket_remove')
async def query_socket_remove(
        query_id: str = Body(...),
        socket_id: str = Body(...),
        signature: str = Depends(token_to_signature)):

    try:
        await qb.remove_query(socket_id, query_id, signature)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
