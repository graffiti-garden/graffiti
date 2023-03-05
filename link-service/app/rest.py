from .schema import parse_object_URL


async def update(db, object, actor):
    # Make sure the actor is logged in
    if not actor:
        raise Exception("you can't modify objects without logging in.")

    # Make sure the object is by the user
    if object['actor'] != actor:
        raise Exception("you can only create objects by yourself.")

    # Make sure the object ID is consistent
    if parse_object_URL(object["id"])[0] != actor:
        raise Exception("object ID is inconsistent with actor.")

    # Insert the new object
    old_object = await db.find_one_and_replace({
        "id": object["id"],
    }, object, upsert=True)

    if old_object:
        return "replaced"
    else:
        return "inserted"

async def remove(db, object_id, actor):
    # Make sure the actor is logged in
    if not actor:
        raise Exception("you can't modify objects without logging in.")

    # Make sure the object ID is consistent
    if parse_object_URL(object_id)[0] != actor:
        raise Exception("object ID is inconsistent with actor.")

    old_object = await db.find_one_and_delete({
        "id": object_id,
    })

    if not old_object:
        raise Exception("""\
the object you're trying to modify either \
doesn't exist or you don't have permission \
to modify it.""")

    return "removed"

async def contexts(db, actor):
    async for doc in db.aggregate([
        { "$match": {
            "actor": actor,
        }},
        { "$project": {
            "_id": 0,
            "context": 1,
        }},
        { "$unwind": {
            "path": "$context"
        }},
        { "$group": {
            "_id": None,
            "context": { "$addToSet": "$context" }
        }}]):

        return doc["context"]
    else:
        return []
