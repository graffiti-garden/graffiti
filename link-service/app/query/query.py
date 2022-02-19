from pydantic import BaseModel
from fastapi import APIRouter, Depends, WebSocket, HTTPException, Body
from ..auth import token_to_user
from ..db import get_db
from .broker import QueryBroker
from .socket import QuerySocket
from .rewrite import query_rewrite

router = APIRouter()

class QueryObjects(BaseModel):
    db: object
    qb: object
qo = QueryObjects()

@router.on_event("startup")
async def start_query_sockets():
    qo.db = await get_db()

    # Create a broker and listen
    # to messages forever
    qo.qb = QueryBroker(qo.db)

@router.websocket("/query")
async def query(
        query: dict,
        time: int = Body(...),
        limit: int = Body(...),
        skip: int = 0,
        user: str = Depends(token_to_user)):

    # Clip the limit
    limit = min(limit, max_limit)

    # Do rewriting for near misses and access control
    query = query_rewrite(query, user)

    # Only find queries that happened before the time
    query["object.created"] = { "$lte": time }

    # Perform the query
    cursor = await qo.db.find(
            query,
            limit=limit,
            sort=[('object.created', 1)],
            skip=skip)
    results = cursor.to_list(length=limit)

    # Close the cursor and return
    cursor.close()
    return results

@router.websocket("/query_one")
async def query_one(
        query: dict,
        time: int = Body(...),
        skip: int = 0,
        user: str = Depends(token_to_user)):

    results = await query(query, time, 1, skip, user)

    if results:
        return results[0]
    else:
        return None

@router.websocket("/query_socket")
async def query_socket(ws: WebSocket, token: str):
    # Validate and convert the token to a user id
    user = token_to_user(token)

    # Open a query socket
    qs = QuerySocket(user, ws, qo.qb)

    # Wait until it dies
    await qs.heartbeat()

@router.post('/query_socket_add')
async def query_socket_add(
        queries: dict[str, dict],
        socket_id: str = Body(...),
        user: str = Depends(token_to_user)):

    try:
        # Add the queries and return the time that happens
        return await qo.qb.add_queries(socket_id, queries, user)
    except Exception as e:
        raise HTTPException(status=400, detail=str(e))

@router.post('/query_socket_remove')
async def query_socket_remove(
        query_ids: list[str],
        socket_id: str = Body(...),
        user: str = Depends(token_to_user)):

    try:
        # Remove the queries and return the time that happens
        return await qo.qb.remove_queries(socket_id, query_ids, user)
    except Exception as e:
        raise HTTPException(status=400, detail=str(e))
