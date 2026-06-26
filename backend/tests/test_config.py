from backend.config import Settings, _required_for_production


def test_vertex_provider_does_not_require_gemini_key():
    s = Settings(ai_provider="vertex", gcp_project_id="readlabs-prod")
    required = _required_for_production(s)
    assert "gemini_api_key" not in required
    assert "gcp_project_id" in required


def test_studio_provider_requires_gemini_key():
    s = Settings(ai_provider="studio")
    required = _required_for_production(s)
    assert "gemini_api_key" in required
    assert "gcp_project_id" not in required


def test_base_secrets_always_required_regardless_of_provider():
    s = Settings(ai_provider="vertex", gcp_project_id="p")
    required = _required_for_production(s)
    for base in ("supabase_url", "supabase_anon_key", "supabase_service_role_key"):
        assert base in required
