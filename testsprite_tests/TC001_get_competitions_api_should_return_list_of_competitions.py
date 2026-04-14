import requests

def test_get_competitions_returns_list():
    base_url = "http://localhost:5173"
    url = f"{base_url}/api/competitions"
    timeout = 30
    headers = {
        "Accept": "application/json"
    }

    try:
        response = requests.get(url, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request to {url} failed: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Adjust to extract list of competitions if wrapped
    if isinstance(data, dict):
        if 'competitions' in data and isinstance(data['competitions'], list):
            data = data['competitions']
        elif 'data' in data and isinstance(data['data'], list):
            data = data['data']
        else:
            assert False, f"Expected list of competitions inside response dict, got keys: {list(data.keys())}"

    assert isinstance(data, list), f"Expected response to be a list, got {type(data)}"

    # Verify each competition item has required fields and expected types
    for comp in data:
        assert isinstance(comp, dict), "Each competition should be a dictionary"

        # Check mandatory fields presence and type; allow 'name' or 'title'
        assert ("name" in comp and isinstance(comp["name"], str)) or ("title" in comp and isinstance(comp["title"], str)), "Competition missing 'name' or 'title' or wrong type"

        assert "id" in comp and isinstance(comp["id"], (str, int)), "Competition missing 'id' or wrong type"
        assert "status" in comp and isinstance(comp["status"], str), "Competition missing 'status' or wrong type"

        # Status should be one of expected states
        assert comp["status"] in {"active", "offline", "pending", "accepted", "live", "completed", "cancelled"}, \
            f"Competition status unexpected: {comp['status']}"

        # Participants should exist and be a list
        assert "participants" in comp and isinstance(comp["participants"], list), \
            "Competition missing 'participants' or not a list"

        # Each participant should be a dict with at least id and name or username
        for participant in comp["participants"]:
            assert isinstance(participant, dict), "Participant should be a dictionary"
            assert "id" in participant and isinstance(participant["id"], (str, int)), \
                "Participant missing 'id' or wrong type"
            assert "name" in participant or "username" in participant, "Participant missing name/username"
            if "name" in participant:
                assert isinstance(participant["name"], str), "Participant 'name' must be a string"
            if "username" in participant:
                assert isinstance(participant["username"], str), "Participant 'username' must be a string"


test_get_competitions_returns_list()
