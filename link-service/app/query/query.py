from pydantic import BaseModel
from fastapi import APIRouter, Depends, WebSocket, HTTPException, Body
from ..auth import token_to_user
from ..db import get_db
from .broker import QueryBroker
from .socket import QuerySocket

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
        num: int = Body(...),
        time: int = Body(...),
        user: str = Depends(token_to_user)):
    # TODO: add constant queries
    # i.e. get N posts matching query before TIME
    # with a maximum N
    pass

@router.websocket("/query_one")
async def query_one(
        query: dict,
        time: int = Body(...),
        user: str = Depends(token_to_user)):
    return query(query, 1, time, user)

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
        time = await qo.qb.add_queries(socket_id, queries, user)
        return {'type': 'Accept', 'time': time}
    except Exception as e:
        raise HTTPException(status=400, detail=str(e))

@router.post('/query_socket_remove')
async def query_socket_remove(
        query_ids: list[str],
        socket_id: str = Body(...),
        user: str = Depends(token_to_user)):

    try:
        time = await qo.qb.remove_queries(socket_id, query_ids, user)
        return {'type': 'Accept', 'time': time}
    except Exception as e:
        raise HTTPException(status=400, detail=str(e))
