import time
from uuid import uuid4

def query_rewrite(query, user):
    return {
        # The object must match the query
        "object": { "$elemMatch": query },
        # The near misses must NOT match the query
        "near_misses": { "$not": { "$elemMatch": query } },
        # The user must be the author, have access, or access must be open
        "$or": [
            { "object.signed": user },
            { "access": user },
            { "access": None }
        ]
    }

def object_rewrite(obj, near_misses, access, user):
    # Sign and date the object and give it a random ID
    obj['signed'] = user
    obj['created'] = time.time_ns()
    obj['uuid'] = str(uuid4())

    # Fill in the near misses with object values
    # if they are not specified.
    for near_miss in near_misses:
        fill_with_template(near_miss, obj)

    # Combine it into one big document
    return {
        "object": [obj],
        "near_misses": near_misses,
        "access": access
    }

def fill_with_template(target, template):
    for entry in template:
        if entry not in target:
            target[entry] = template[entry]
        else:
            if isinstance(target[entry], dict) and isinstance(template[entry], dict):
                # Recursively fill
                fill_with_template(target[entry], template[entry])
