import pytest
from backend.db import QueryBuilder


def test_in_filter_produces_correct_param():
    qb = QueryBuilder("papers")
    qb.in_("id", ["abc", "def", "ghi"])
    assert qb._params["id"] == "in.(abc,def,ghi)"


def test_in_filter_is_chainable():
    qb = QueryBuilder("assignments")
    qb.in_("class_id", ["c1", "c2"]).eq("status", "published")
    assert qb._params["class_id"] == "in.(c1,c2)"
    assert qb._params["status"] == "eq.published"


def test_is_null_filter():
    qb = QueryBuilder("assignments")
    qb.is_("class_id", "null")
    assert qb._params["class_id"] == "is.null"


def test_is_null_filter_chainable():
    qb = QueryBuilder("assignments")
    qb.eq("paper_id", "p-1").is_("class_id", "null")
    assert qb._params["paper_id"] == "eq.p-1"
    assert qb._params["class_id"] == "is.null"
