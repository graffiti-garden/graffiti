import re
from jsonschema import Draft7Validator

sha_regex = "[0-9a-f]{64}"
random_regex = ".{1,64}"
object_url_regex = f"^graffitiobject:\/\/({sha_regex}):({random_regex})$"
actor_url_regex = f"^graffitiactor://{sha_regex}$"

object_url_re = re.compile(object_url_regex)
def parse_object_URL(object_url):
    actor_id, object_key = object_url_re.search(object_url).groups()
    return f"graffitiactor://{actor_id}", object_key

schema = {
    "type": "object",
    "properties": {
        "messageID": { "$ref": "#/definitions/randomID" },
        "update": { "$ref": "#/definitions/object" },
        "remove": { "$ref": "#/definitions/objectURL" },
        "subscribe": { "$ref": "#/definitions/context" },
        "unsubscribe": { "$ref": "#/definitions/context" },
        "get": { "$ref": "#/definitions/objectURL" },
        "ls": { "type": "null" }
    },
    "additionalProperties": False,
    "oneOf": [
        { "required": ["messageID", x] } for x in \
        ["update", "remove", "subscribe", "unsubscribe", "get", "ls"]
    ],
    "definitions": {
        "object": {
            "type": "object",
            "properties": {
                "actor": { "$ref": "#/definitions/actorURL" },
                "id":    { "$ref": "#/definitions/objectURL" },
                "context":   { "$ref": "#/definitions/context" },
                "bto":   { "$ref": "#/definitions/actorURLs" },
                "bcc":   { "$ref": "#/definitions/actorURLs" }
            },
            "required": ["actor", "id", "context"]
        },
        "actorURL": {
            # A SHA256 String
            "type": "string",
            "pattern": actor_url_regex
        },
        "randomID": {
            # Unstructured user input - any reasonably sized string
            "type": "string",
            "pattern": f"^{random_regex}$"
        },
        "objectURL": {
            # A user ID plus unstructured input
            "type": "string",
            "pattern": object_url_regex
        },
        "context": {
            "type": "array",
            "uniqueItems": True,
            "minItems": 1,
            "items": { "type": "string" }
        },
        "actorURLs": {
            "uniqueItems": True,
            "type": "array",
            "items": { "$ref": "#/definitions/actorURL" }
        },
    }
}

validator = Draft7Validator(schema)
validate = lambda msg: validator.validate(msg)

def query_access(actor):
    return { "$or": [

        # The object is public
        {  "bto": { "$exists": False },
           "bcc": { "$exists": False } },

        # The actor is the recipient or sender
        { "bto":   actor },
        { "bcc":   actor },
        { "actor": actor }]}
