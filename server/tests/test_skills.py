from pathlib import Path

from core.skills import SkillRouter, _parse_skill

SKILLS_DIR = Path(__file__).parents[1] / "skills"


def test_six_skills_charges():
    router = SkillRouter(SKILLS_DIR)
    names = {s.name for s in router.skills}
    assert names == {
        "deep-reasoning", "calibrated-judgment", "verification-discipline",
        "communicating-results", "token-economy", "memory-discipline",
    }


def test_always_skills_toujours_presents():
    router = SkillRouter(SKILLS_DIR)
    out = router.select("bonjour", "local")
    assert "calibrated-judgment" in out
    assert "token-economy" in out
    assert "communicating-results" in out
    assert "deep-reasoning" not in out


def test_routage_par_intent():
    router = SkillRouter(SKILLS_DIR)
    assert "deep-reasoning" in router.select("pourquoi mon pc est lent ?", "local")
    assert "verification-discipline" in router.select("crée un fichier test.txt", "local")
    assert "memory-discipline" in router.select("souviens-toi que je préfère le thé", "local")


def test_variantes_local_vs_cloud():
    router = SkillRouter(SKILLS_DIR)
    local = router.select("bonjour", "local")
    cloud = router.select("bonjour", "cloud")
    assert local != cloud
    assert len(cloud) > len(local)


def test_parse_skill_sans_frontmatter(tmp_path):
    bad = tmp_path / "bad.md"
    bad.write_text("pas de frontmatter", encoding="utf-8")
    assert _parse_skill(bad) is None


def test_repertoire_absent_ne_plante_pas(tmp_path):
    router = SkillRouter(tmp_path / "inexistant")
    assert router.skills == []
    assert router.select("test", "local") == ""
