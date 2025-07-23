import os
import json

class TemplateManager:
    _sequences = None

    @classmethod
    def load_templates(cls, path="static/templates"):
        cls._sequences = {}
        for fname in os.listdir(path):
            if fname.endswith(".json"):
                with open(os.path.join(path, fname)) as f:
                    cls._sequences[fname] = json.load(f)

    @classmethod
    def get_sequence(cls, name=None):
        if cls._sequences is None:
            cls.load_templates()
        if name and name in cls._sequences:
            return cls._sequences[name]
        return next(iter(cls._sequences.values()))