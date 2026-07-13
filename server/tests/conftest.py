import sys
from pathlib import Path

# Les modules du serveur s'importent depuis la racine server/
sys.path.insert(0, str(Path(__file__).parents[1]))
