import time
import copy
from uuid import uuid4

def object_to_doc(object):
    # Separate out the contexts and id proof
    contexts = object['_contexts']
    del object['_contexts']
    id_proof = object['_idProof']
    del object['_idProof']

    # Always Add _to and _id
    default_contexts = [
        { '_nearMisses': [ [ ['_to', 0] ] ] },
        { '_nearMisses': [ [ ['_id'] ] ] }
    ]

    # Rewrite the contexts
    computed_contexts = []
    for context in contexts + default_contexts:
        computed_contexts.append({})

        for subtype in context:
            computed_contexts[-1][subtype] = []

            for twiddled_object in context[subtype]:
                # Clone the object
                computed_contexts[-1][subtype].append(copy.deepcopy(object))

                for twiddle_path in twiddled_object:
                    twiddle(computed_contexts[-1][subtype][-1], twiddle_path)

    # Extract the ID and combine into one big doc
    doc = {
        "_object": [object],
        "_computed_contexts": computed_contexts,
        "_contexts": contexts,
        "_tombstone": False,
        "_id_proof": id_proof
    }

    return doc

def twiddle(obj, twiddle_path):
    # Walk along the path until there is
    # only one element left.
    position = 0
    while position + 1 < len(twiddle_path):
        # This might fail but the exception will be caught higher up
        obj = obj[twiddle_path[position]]
        position += 1

    # Assign it something random
    obj[twiddle_path[position]] = str(uuid4())

def doc_to_object(doc):
    object = doc['_object'][0]
    object['_contexts'] = doc['_contexts']
    object['_idProof']  = doc['_id_proof']
    return object

def query_rewrite(query):
    return {
        # The object must match the query
        "_object": { "$elemMatch": query },
        # The object must match at least one of the contexts
        "_computed_contexts": { "$elemMatch": {
            # None of the near misses can match the query
            "_nearMisses": {
                "$not": { "$elemMatch": query }
            },
            # All of the neighbors must match the query
            "_neighbors": {
                "$not": {
                    # Which is the negation of:
                    # "some neighbor does not match the query"
                    "$elemMatch": { "$nor": [ query ] }
                }
            }
        }}
    }
