def test_health_returns_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_path_returns_json_404(client):
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"message": "Not found.", "extra": {}}


def test_disallowed_host_returns_json_400(client):
    response = client.get("/api/health", HTTP_HOST="evil.example")

    assert response.status_code == 400
    assert response.json() == {"message": "Bad request.", "extra": {}}
