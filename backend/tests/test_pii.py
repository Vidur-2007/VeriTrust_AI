import pytest

from app.pii import redact


@pytest.mark.parametrize("text", [
    "Mail me at ravi.kumar@example.co.in please",
    "call +91 98480 22338",
    "call +91-9848022338",
    "my number is 9848022338",
    "landline style 09848022338",
    "PNR is X7K2QD",
    "booking 4TR9ZA was cancelled",
])
def test_masks_pii(text: str) -> None:
    r = redact(text)
    assert r.redacted, text
    assert "[" in r.text


def test_replacement_tokens() -> None:
    r = redact("Email a@b.com, phone 9876543210, PNR AB12CD")
    assert r.text == "Email [EMAIL], phone [PHONE], PNR [PNR]"
    assert r.counts == {"EMAIL": 1, "PHONE": 1, "PNR": 1}


@pytest.mark.parametrize("text", [
    "I want a REFUND for my flight",
    "Change fee is ₹3,000 per sector",
    "Excess baggage costs ₹650 per kg",
    "Silver needs 15,000 Tier Miles",
    "cabin bag 55 x 35 x 25 cm",
    "Gold members get 40000 Miles",
])
def test_leaves_normal_text(text: str) -> None:
    r = redact(text)
    assert not r.redacted, r.text
    assert r.text == text


def test_flight_numbers_are_masked_as_pnr() -> None:
    # Known limitation: a 6-char flight number is indistinguishable from a PNR. We over-mask.
    assert redact("Flight CA1234 from Hyderabad").text == "Flight [PNR] from Hyderabad"


@pytest.mark.parametrize("text", [
    "मेरी बिल्ली के लिए केबिन में फीस कितनी है?",
    "నా క్రెడిట్ షెల్ ఎంత కాలం చెల్లుతుంది?",
])
def test_hindi_and_telugu_pass_through(text: str) -> None:
    assert redact(text).text == text


def test_pii_inside_a_question() -> None:
    r = redact("My PNR is K9XQ2M and my phone is +91 98765 43210, can I change the date?")
    assert r.text == "My PNR is [PNR] and my phone is [PHONE], can I change the date?"
