import re
import json
import jsonschema
from jsonschema.exceptions import ValidationError

ALLOWED_QUERY_OPERATORS = ["elemMatch", "type", "exists", "size", "and", "not", "nor", "or", "in", "nin", "all", "eq", "ne", "gt", "lt", "lte", "gte"]

# Hex representation of sha256
SHA256_PATTERN = "[0-9a-f]{64}" # regex
SHA256_SCHEMA = { # jsonschema
    "type": "string",
    "pattern": f"^{SHA256_PATTERN}$"
}

# Random user input - any reasonably sized string
RANDOM_SCHEMA = { # jsonschema
    "type": "string",
    "pattern": "^.{1,64}$"
}

# Anything not starting with a "$"
QUERY_VALUE_PROPERTY_PATTERN = "^(?!\$).*$"

# Anything not starting with a "_" or a "$" or containing periods
OBJECT_PROPERTY_PATTERN = "^(?!_|\$)[^\.]*$"

ARRAY_OF_PATH_GROUPS = {
    "type": "array",
    "uniqueItems": True,
    "minItems": 1,
    "items": {
        "oneOf": [ {
                "type": "string",
                "pattern": QUERY_VALUE_PROPERTY_PATTERN
        }, {
            "type": "array",
            "uniqueItems": True,
            "minItems": 2,
            "items": { 
                "type": "string",
                "pattern": QUERY_VALUE_PROPERTY_PATTERN
            }
        } ]
    }
}

def socket_schema():
    BASE_TYPES = ["messageID", "type"]

    return {
    "type": "object",
    "oneOf": [{
        # UPDATE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "update" },
            "object": { "$ref": "#/definitions/object" },
            "query": { "$ref": "#/definitions/query" },
        },
        "required": BASE_TYPES + ["object", "query"],
        "additionalProperties": False
    }, {
        # DELETE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "delete" },
            "objectID": RANDOM_SCHEMA
        },
        "required": BASE_TYPES + ["objectID"],
        "additionalProperties": False
    }, {
        # SUBSCRIBE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "subscribe" },
            "query": { "$ref": "#/definitions/query" },
            "since": { "oneOf": [{
                    "type": "string",
                    # A mongo object ID
                    "pattern": "^([a-f\d]{24})$"
                }, { "type": "null" }]
            },
            "queryID": RANDOM_SCHEMA,
            "audit": { "type": "boolean" }
        },
        "required": BASE_TYPES + ["query", "since", "queryID"],
        "additionalProperties": False
    }, {
        # UNSUBSCRIBE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "unsubscribe" },
            "queryID": RANDOM_SCHEMA
        },
        "required": BASE_TYPES + ["queryID"],
        "additionalProperties": False
    }],
    "definitions": {
        "object": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                OBJECT_PROPERTY_PATTERN: { "$ref": "#/definitions/objectValues" }
            },
            "required": ["_id", "_by", "_inContextIf"],
            "properties": {
                "_by": SHA256_SCHEMA,
                "_to": {
                    "uniqueItems": True,
                    "type": "array",
                    "items": SHA256_SCHEMA
                },
                "_id": RANDOM_SCHEMA,
                "_inContextIf": {
                    "type": "array",
                    "uniqueItems": True,
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "_queryFailsWithout": ARRAY_OF_PATH_GROUPS,
                            "_queryPassesWithout": ARRAY_OF_PATH_GROUPS
                        }
                    }
                }
            }
        },
        "objectValues": { "oneOf": [
            { "type": "object",
                "additionalProperties": False,
                "patternProperties": {
                    OBJECT_PROPERTY_PATTERN: { "$ref": "#/definitions/objectValues" }
                }
            },
            { "type": "array",
                "items": { "$ref": "#/definitions/objectValues" }
            },
            { "type": ["string", "number", "boolean", "null"] }
        ]},
        "query": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                # Anything not starting with a "$"
                QUERY_VALUE_PROPERTY_PATTERN: { "$ref": "#/definitions/queryValue" }
            },
            # To must be a SHA
            "properties": { "_to": SHA256_SCHEMA } |
            # And allowed query types recurse
                { '$' + o: { "$ref": "#/definitions/queryValue" }
                    for o in ALLOWED_QUERY_OPERATORS }
        },
        "queryValue": { "oneOf": [
            { "$ref": "#/definitions/query" },
            { "type": "array",
                "items": { "$ref": "#/definitions/queryValue" }
            },
            { "type": ["string", "number", "boolean", "null"] }
        ] }
    }}

# Initialize the scheme validator and owner checker
VALIDATOR = jsonschema.Draft7Validator(socket_schema())
QUERY_OWNER_PATTERN  = re.compile(f'"_to": "({SHA256_PATTERN})"')

def validate(msg, owner_id):
    VALIDATOR.validate(msg)

    if msg['type'] == 'update':
        if msg['object']['_by'] != owner_id:
            raise ValidationError("you can only create objects _by yourself")
    if msg['type'] in ['subscribe', 'update']:
        matches = QUERY_OWNER_PATTERN.findall(json.dumps(msg['query']))
        for match in matches:
            if match != owner_id:
                raise ValidationError("you can only query for objects _to yourself")
