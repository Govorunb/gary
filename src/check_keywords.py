from gary.util.utils import _GUIDANCE_SCHEMA_SUPPORTED_KEYWORDS

def test_keywords():
    from guidance import json
    json(schema=_GUIDANCE_SCHEMA_SUPPORTED_KEYWORDS)
    print("OK")

if __name__ == "__main__":
    test_keywords()
