def query_rewrite(query, signature):
    return {
        # The object must match the query
        "object": { "$elemMatch": query },
        # The near misses must NOT match the query
        "near_misses": { "$not": { "$elemMatch": query } },
        # The user must be the author, have access, or access must be open
        "$or": [
            { "object.signature": signature },
            { "access": signature },
            { "access": None }
        ]
    }

def object_rewrite(object, near_misses, access, signature):
    # Sign the object
    object['signature'] = signature

    # Fill in the near misses with object values
    # if they are not specified.
    for near_miss in near_misses:
        fill_with_template(near_miss, object)

    # Combine it into one big document
    return {
        "object": [object],
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
