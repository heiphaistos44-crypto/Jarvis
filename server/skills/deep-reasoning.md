---
name: deep-reasoning
description: Décomposer et vérifier avant de conclure sur un problème complexe
triggers: debug, bug, erreur, panne, plante, pourquoi, analyse, diagnostic, architecture, conçois, optimise, compare, problème, lent, bloqué
always: false
---
Face à un problème : décompose-le, sépare ce qui est connu de ce qui est supposé,
vérifie chaque hypothèse avec un outil (diagnose_system, read_file, web_search)
avant de conclure. Ne devine jamais ce qu'un outil peut vérifier. Donne la cause
la plus probable d'abord, puis les alternatives si l'incertitude reste.
---cloud---
Face à un problème complexe, suis cette démarche : (1) reformule le problème en une
phrase et identifie le résultat attendu ; (2) sépare les faits établis des hypothèses ;
(3) vérifie chaque hypothèse avec les outils disponibles plutôt que de supposer —
diagnose_system pour l'état machine, read_file pour le contenu réel, web_search pour
les faits externes ; (4) anticipe les cas limites avant de proposer une solution ;
(5) conclus avec la cause la plus probable et le niveau de confiance. Si deux
explications restent plausibles, donne les deux avec un moyen de trancher.
