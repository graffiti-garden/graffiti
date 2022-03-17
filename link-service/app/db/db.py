import time
from uuid import uuid4
from os import getenv
import asyncio
from pydantic import BaseModel
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
open_sockets = {}

@router.on_event("startup")
async def startup():
    client.get_io_loop = asyncio.get_running_loop

    # Create indexes for common fields if
    # they don't already exist.
    await db.create_index('object.id')
    await db.create_index('object.type')
    await db.create_index('object.signature')
    await db.create_index('object.timestamp')
    await db.create_index('object.tags')

class Context(BaseModel):
    nearMisses: list[dict] = []
    neighbors: list[dict] = []

@router.post('/update')
async def update(
        object: dict,
        contexts: list[Context] = [],
        access: list[str]|None = None,
        signature: str = Depends(token_to_signature)):

    # Rewrite the new document
    contexts = [context.dict() for context in contexts]
    new_doc = object_rewrite(object, contexts, access, signature)

    # First check if the object includes an ID field
    # This tells us if we're inserting or replacing
    if 'id' in object:
        # We're replacing.
        # Check that the object that already exists
        # and that it is owned by the signer
        old_doc = await db.find_one({
            "object.id": object['id'],
            "object.signature": signature})
        if not old_doc:
            raise HTTPException(status_code=400, detail="The object you're trying to replace either doesn't exist or you don't have permission to replace it.")

        # Check what queries the object matches before replacement
        matches_before = await qb.change(object['id'])

        # Replace the old document with the new
        await db.replace_one({"object.id": object['id']}, new_doc)

    else:
        # Otherwise, we're inserting.
        # Create a new random ID
        object['id'] = str(uuid4())

        # The object is new so nothing previously matched
        matches_before = []

        # And insert it into the database
        await db.insert_one(new_doc)

    # Check what queries the object matches after it's inserted
    matches_after = await qb.change(object['id'])

    # If a query matched before but not after, the object has gone
    # out of scope for that query so send a deletion.
    for socket_id, query_id in matches_before:
        if socket_id not in open_sockets:
            continue
        if (socket_id, query_id) not in matches_after:
            await open_sockets[socket_id].delete(query_id, object['id'])

    # Otherwise send a replacement
    for socket_id, query_id in matches_after:
        if socket_id not in open_sockets:
            continue
        await open_sockets[socket_id].update(query_id, new_doc)

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

    # Check what queries this object affects
    matches = await qb.change(object_id)

    # Perform deletion
    await db.delete_one({"object.id": object_id})

    # Propagate the changes to the sockets
    for socket_id, query_id in matches:
        if socket_id not in open_sockets:
            continue
        await open_sockets[socket_id].delete(query_id, object_id)

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
        'contexts': r['contexts'],
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
    socket_id = str(uuid4())
    open_sockets[socket_id] = QuerySocket(signature, ws)
    qb.add_socket(socket_id)

    # Wait until it dies
    await open_sockets[socket_id].heartbeat(socket_id)

    # Remove the query
    qb.delete_socket(socket_id)
    del open_sockets[socket_id]

@router.post("/update_socket_query")
async def update_socket_query(
        query: dict,
        query_id: str = Body(...),
        socket_id: str = Body(...),
        signature: str = Depends(token_to_signature)):

    # Rewrite the query and check if its valid
    query = query_rewrite(query, signature)
    # (if it isn't this will error)
    try:
        await db.find_one(query)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Make sure the socket is valid and add
    validate_socket(socket_id, signature)
    try:
        qb.update_query(socket_id, query_id, query)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/delete_socket_query")
async def delete_socket_query(
        query_id: str = Body(...),
        socket_id: str = Body(...),
        signature: str = Depends(token_to_signature)):

    # Make sure the socket is valid and remove
    validate_socket(socket_id, signature)
    try:
        qb.delete_query(socket_id, query_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def validate_socket(socket_id, signature):
    if not socket_id in open_sockets:
        raise HTTPException(status_code=400, detail=f"a socket with id {socket_id} is not open")
    if open_sockets[socket_id].signature != signature:
        raise HTTPException(status_code=400, detail=f"a socket with id {socket_id} is not owned by {signature}")
