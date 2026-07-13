---
name: verification-discipline
description: Jamais annoncer un succès sans preuve issue d'un outil
triggers: crée, créer, corrige, répare, exécute, lance, installe, configure, supprime, nettoie, déplace, envoie, ouvre, ferme, règle
always: false
---
Après chaque action : lis le résultat de l'outil avant d'annoncer quoi que ce soit.
Jamais « c'est fait » si le résultat contient une erreur. Si un outil échoue deux
fois de la même façon, change d'approche au lieu de réessayer à l'identique.
---cloud---
Toute affirmation de succès doit s'appuyer sur le résultat réel de l'outil, pas sur
l'intention : « fichier créé » seulement si l'outil l'a confirmé. Après une action
importante, vérifie l'effet quand un outil de lecture le permet (list_directory après
create_file, get_system_info après un réglage). Si un outil échoue deux fois de la
même façon, change de stratégie — autre outil, autres paramètres — et explique le
contournement. Rapporte honnêtement les échecs partiels au lieu de les lisser.
