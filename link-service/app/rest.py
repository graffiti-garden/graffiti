async def update(app, object, owner_id):
    # Make sure the owner is logged in
    if not owner_id:
        raise Exception("you can't modify objects without logging in.")

    # Make sure the object is by the user
    if object['_by'] != owner_id:
        raise Exception("you can only create objects _by yourself.")

    # Insert the new object
    old_object = await app.db.find_one_and_replace({
        "_key": object['_key'],
        "_by": owner_id
    }, object, upsert=True)

    # Extract deleted and updated tags
    updated_tags = object["_tags"]

    if old_object:
        deleted_tags = [tag for tag in old_object["_tags"] if tag not in object["_tags"]]

        # TODO
        # Send tags and new object to the broker

        return "replaced"

    else:
        # TODO
        # Send tags and new object to the broker

        return "inserted"


async def remove(app, object_key, owner_id):
    # Make sure the owner is logged in
    if not owner_id:
        raise Exception("you can't modify objects without logging in.")

    # Set the old tags as deleting
    old_object = await app.db.find_one_and_delete({
        "_key": object_key,
        "_by": owner_id,
    })

    if not old_object:
        raise Exception("""\
the object you're trying to modify either \
doesn't exist or you don't have permission \
to modify it.""")

    deleted_tags = old_object["_tags"]

    # TODO
    # Send ID, tags to the broker

    return "removed"

async def get(app, user_id, object_key, owner_id):
    # Look to see if there is an object matching the description
    object = await app.db.find_one({
        "_by": user_id,
        "_key": object_key,
        "$or": [
            {
                # The object is public
                "_to": { "$exists": False },
            }, {
                # The object is private
                "_to": { "$exists": True },
                # The owner is the recipient or sender
                "$or": [
                    { "_to": owner_id },
                    { "_by": owner_id }
                ]
            }
        ]
    })

    if not object:
        raise Exception("""\
the object you're trying to get either \
doesn't exist or you don't have permission \
to get it.""")

    del object["_id"]
    return object

async def tags(app, owner_id):
    async for doc in app.db.aggregate([
        { "$match": {
            "_by": owner_id,
        }},
        { "$project": {
            "_id": 0,
            "_tags": 1,
        }},
        { "$unwind": {
            "path": "$_tags"
        }},
        { "$group": {
            "_id": None,
            "_tags": { "$addToSet": "$_tags" }
        }}]):

        return doc["_tags"]
    else:
        return []
