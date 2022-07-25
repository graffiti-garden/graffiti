import re
import time
import copy
from uuid import uuid4

def object_to_doc(object):
    # Separate out the id proof and contexts
    id_proof = object['_idProof']
    del object['_idProof']
    contexts = object['_inContextIf']
    del object['_inContextIf']

    # Always add _id and _to for each recipient
    default_contexts = \
        [ { '_queryFailsWithout': [ '_id' ] } ] + \
        [ { '_queryFailsWithout': [ f'_to.{i}' ] } 
            for i, _ in enumerate(object['_to']) ]

    # Expand the contexts by creating full copies
    # of the original object except for a couple
    # "twiddled" fields that will no longer match.
    expanded_contexts = []
    for context in contexts + default_contexts:
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

    # Extract the ID and combine into one big doc
    doc = {
        "_object": [object],
        "_expandedContexts": expanded_contexts,
        "_inContextIf": contexts,
        "_tombstone": False,
        "_idProof": id_proof
    }

    return doc

odd_slashes_regex = r'(?<!\\)\\(?:\\\\)*'
odd_slashes  = re.compile(f'({odd_slashes_regex})(?=\.)')
ending_slashes = re.compile(r'\\+$')
dot_notation = re.compile(r'((?:(?:' + odd_slashes_regex + r'\.)|[^\.])+)')

def twiddle(obj, path_str):
    # Convert the string path to an array
    # based on period divisions, but allow
    # for escaped periods. i.e.:
    # 
    # { 'foo': { 'bar': [ { 'this.works': 'hello' } ]
    #
    # 'foo.bar.0.this\.works' -> 'hello'
    #
    path = dot_notation.findall(path_str)
    # Remove escapes before periods
    path = [odd_slashes.sub(lambda x: x.group(0)[:-1:2], p) for p in path]
    # Remove escapes at the end of subdivisions
    path[:-1] = [ending_slashes.sub(lambda x: x.group(0)[:2], p) for p in path[:-1]]

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
    object['_inContextIf'] = doc['_inContextIf']
    object['_idProof']  = doc['_idProof']
    return object

def query_rewrite(query):
    return {
        # The object must match the query
        "_object": { "$elemMatch": query },
        # The object must match at least one of the contexts
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
        }}
    }
