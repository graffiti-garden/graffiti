from pydantic import BaseModel
from fastapi import Response, status

class Credential(BaseModel):
    id: str
    publicKey: str
    algorithm: str

class KeyServer:

    async def initialize(self, client):
        if 'keys' not in await client.graffiti.list_collection_names():
            await client.graffiti.create_collection('keys')

        self.db = client.graffiti.keys
        await self.db.create_index('id', unique=True)

    async def post_key(self, credential: Credential, response: Response):
        print(credential)
        try:
            await self.db.insert_one(credential.dict())
        except Exception as e:
            response.status_code = status.HTTP_409_CONFLICT
            return "key already exists"
        return "inserted"

    async def get_key(self, key: str, response: Response):
        output =  await self.db.find_one({ "id": key })
        if output:
            del output["_id"]
        else:
            response.status_code = status.HTTP_404_NOT_FOUND
        return output