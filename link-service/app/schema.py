from jsonschema import Draft7Validator

schema = {
    "type": "object",
    "properties": {
        "messageID": { "$ref": "#/definitions/random_string" },
        "object": { "$ref": "#/definitions/object" },
        "objectKey": { "$ref": "#/definitions/random_string" },
        "userID": { "$ref": "#/definitions/userID" },
        "tags": { "$ref": "#/definitions/tags" },
        "tagsSince": { "$ref": "#/definitions/tagsSince" },
    },
    "additionalProperties": False,
    "anyOf": [
        # UPDATE
        { "required": ["messageID", "object"] },
        # DELETE
        { "required": ["messageID", "objectKey"] },
        # SUBSCRIBE
        { "required": ["messageID", "tagsSince"] },
        # UNSUBSCRIBE
        { "required": ["messageID", "tags"] },
        # GET SPECIFIC OBJECT
        { "required": ["messageID", "userID", "objectKey"] },
        # LIST PERSONALLY USED TAGS
        { "required": ["messageID"] }
    ],
    "definitions": {
        "object": {
            "type": "object",
            "properties": {
                "_by": { "$ref": "#/definitions/userID" },
                "_key": { "$ref": "#/definitions/random_string" },
                "_tags": { "$ref": "#/definitions/tags" },
                "_to": {
                    "uniqueItems": True,
                    "type": "array",
                    "items": { "$ref": "#/definitions/userID" },
                },
            },
            "patternProperties": {
                # Anything not starting with an underscore is OK
                "^(?!_).*$": True
            },
            "required": ["_key", "_by", "_tags"],
            "additionalProperties": False
        },
        "tags": {
            "type": "array",
            "uniqueItems": True,
            "minItems": 1,
            "items": { "$ref": "#/definitions/random_string" },
        },
        "tagsSince": {
            # A list of (tag, date) tuples
            "type": "array",
            "uniqueItems": True,
            "minItems": 1,
            "items": {
                "type": "array",
                "items": [
                    { "$ref": "#/definitions/random_string" },
                    { "$ref": "#/definitions/ISODate" }
                ],
                "minItems": 2,
                "maxItems": 2,
            }
        },
        "random_string": {
            # Unstructured user input - any reasonably sized string
            "type": "string",
            "pattern": "^.{1,64}$"
        },
        "userID": {
            # A SHA256 String
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
        },
        "ISODate": {
            "oneOf": [{
                "type": "string",
                "format": "date-time"
            }, { "type": "null" }
        ]}
    }
}

validator = Draft7Validator(schema, format_checker=Draft7Validator.FORMAT_CHECKER)
validate = lambda msg: validator.validate(msg)
def query_access(owner_id):
    return { "$or": [
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
    ]}
