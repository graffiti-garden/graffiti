def query_rewrite(query, signature):
    return {
        # The object must match the query
        "object": { "$elemMatch": query },
        "$and": [
            { "$or": [
                # Either there are no contexts
                { "contexts": { "$size": 0 } },
                # Or the object must match at least one of the contexts
                { "contexts": { "$elemMatch": {
                    # None of the near misses can match the query
                    "nearMisses": {
                        "$not": { "$elemMatch": query }
                    },
                    # All of the neighbors must match the query
                    "neighbors": {
                        "$not": {
                            # Which is the negation of:
                            # "some neighbor does not match the query"
                            "$elemMatch": { "$nor": [ query ] }
                        }
                    }
                }}}
            ]},
            # The user must be the author, have access, or access must be open
            { "$or": [
                { "object.signature": signature },
                { "access": signature },
                { "access": None }
            ]}
        ]
    }

def object_rewrite(object, contexts, access, signature):
    # Sign the object
    object['signature'] = signature

    for context in contexts:
        for near_miss in context["nearMisses"]:
            fill_with_template(near_miss, object)
        for neighbor in context["neighbors"]:
            fill_with_template(neighbor, object)

    # Combine it into one big document
    return {
        "object": [object],
        "contexts": contexts,
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
