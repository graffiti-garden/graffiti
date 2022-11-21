import re
import time
import copy
from uuid import uuid4

def object_to_doc(object):
    # Form an output and separate out the ID proof
    output = {
        "_tombstone": False,
        "_externalID": object['_id']
    }
    del object['_id']

    if '_inContextIf' in object:
        # Separate out the contexts
        output["_inContextIf"] = contexts = object['_inContextIf']
        del object['_inContextIf']
    else:
        contexts = [{}]

    # Expand the contexts by creating full copies
    # of the original object except for a couple
    # "twiddled" fields that will no longer match.
    expanded_contexts = []
    for context in contexts:
        expanded_context = {}
        expanded_contexts.append(expanded_context)

        for subtype in context:
            expanded_context[subtype] = []

            for path_or_paths in context[subtype]:

                clone = copy.deepcopy(object)
                expanded_context[subtype].append(clone)

                if isinstance(path_or_paths, str):
                    path = path_or_paths
                    twiddle(clone, path)
                else:
                    paths = path_or_paths
                    for path in paths:
                        twiddle(clone, path)

    output["_object"] = [object]
    output["_expandedContexts"] = expanded_contexts
    return output

dot_notation = re.compile(r'[^\.]+')

def twiddle(obj, path_str):
    # Convert the string path to an array
    # based on period divisions
    # (periods aren't allowed in field names)
    # 
    # { 'foo': { 'bar': [ { 'asdf': 'hello' } ]
    #
    # 'foo.bar.0.asdf' -> 'hello'
    #
    path = dot_notation.findall(path_str)

    for i, path_el in enumerate(path):
        if isinstance(obj, list):
            try:
                path_el = int(path_el)
            except:
                raise ValueError(f'element {i} of the context path "{path_str}", "{path_el}", is not an integer, but you are trying to index a list, {obj}')

            if not 0 <= path_el < len(obj):
                raise IndexError(f'element {i} of the context path "{path_str}", "{path_el}", is out of bounds of the array of length {len(obj)}, {obj}')
        else:
            if path_el not in obj:
                raise KeyError(f'element {i} of the context path "{path_str}", "{path_el}", is not a key in the object, {obj}')

        if i + 1 < len(path):
            # Walk along the path until there is
            # only one element left.
            # This might fail but the exception will be caught higher up
            obj = obj[path_el]

        else:
            if not isinstance(obj[path_el], str):
                raise ValueError(f'the context path, "{path_str}", references a value that is not a string, {obj[path_el]}')

            # At the end, assign the last character
            # to nonsense that won't match
            obj[path_el] = obj[path_el][:-1] + '\uFABC'

def doc_to_object(doc):
    object = doc['_object'][0]
    object['_id'] = doc['_externalID']
    if '_inContextIf' in doc:
        object['_inContextIf'] = doc['_inContextIf']
    return object

def query_rewrite(query, owner_id):
    if "_audit" in query:
        if query.pop("_audit"):
            return {
                # The object must still match the query
                "_object": { "$elemMatch": query },
                # No context, just anything by myself
                "_object._by": owner_id
            }

    return {
        # The object must match the query
        "_object": { "$elemMatch": query },
        # And the object matches at least one of the contexts
        "_expandedContexts": { "$elemMatch": {
            # None of these "near misses" can match the query
            "_queryFailsWithout": {
                "$not": { "$elemMatch": query }
            },
            # All of these "neighbors" must match the query
            "_queryPassesWithout": {
                "$not": {
                    # Which is the negation of:
                    # "some neighbor does not match the query"
                    "$elemMatch": { "$nor": [ query ] }
                }
            }
        }},
        "$or": [
            {
                # The object is public
                "_object._to": { "$exists": False },
            }, {
                # The object is private
                "_object._to": { "$exists": True },
                # The owner is the recipient or sender
                "$or": [
                    { "_object._to": owner_id },
                    { "_object._by": owner_id }
                ]
            }
        ]
    }
