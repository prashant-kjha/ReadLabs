import pytest
from backend.db import QueryBuilder


def test_in_filter_quotes_string_values():
    qb = QueryBuilder("papers")
    qb.in_("id", ["abc", "def", "ghi"])
    assert qb._params["id"] == 'in.("abc","def","ghi")'


def test_in_filter_is_chainable():
    qb = QueryBuilder("assignments")
    qb.in_("class_id", ["c1", "c2"]).eq("status", "published")
    assert qb._params["class_id"] == 'in.("c1","c2")'
    assert qb._params["status"] == "eq.published"


def test_in_filter_handles_reserved_chars_and_quotes():
    """Values with PostgREST-reserved chars (commas, parens) or quotes must not
    break out of the in.(...) expression."""
    qb = QueryBuilder("papers")
    qb.in_("title", ['Attention, Is All (You) Need', 'He said "hi"'])
    assert qb._params["title"] == 'in.("Attention, Is All (You) Need","He said \\"hi\\"")'


def test_in_filter_leaves_non_strings_unquoted():
    qb = QueryBuilder("papers")
    qb.in_("page", [1, 2, 3])
    assert qb._params["page"] == "in.(1,2,3)"


def test_is_null_filter():
    qb = QueryBuilder("assignments")
    qb.is_("class_id", "null")
    assert qb._params["class_id"] == "is.null"


def test_is_null_filter_chainable():
    qb = QueryBuilder("assignments")
    qb.eq("paper_id", "p-1").is_("class_id", "null")
    assert qb._params["paper_id"] == "eq.p-1"
    assert qb._params["class_id"] == "is.null"


def test_querybuilder_ilike_and_offset_set_params():
    q = QueryBuilder("papers")
    q.select("*").eq("uploaded_by", "u1").ilike("title", "%attn%").order("created_at", desc=True).limit(10).offset(20)
    assert q._params["uploaded_by"] == "eq.u1"
    assert q._params["title"] == "ilike.%attn%"
    assert q._params["order"] == "created_at.desc"
    assert q._params["limit"] == "10"
    assert q._params["offset"] == "20"
