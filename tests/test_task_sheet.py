from tests import test_client_tools as source


class TaskSheetWorkflow(source.Base):
    sheet = source.TaskSheet.sheet
    def test_proof_expected_dates_and_sales_metrics_round_trip(self):
        response = self.sheet(2, "anu", proof_of_work="Shared proposal", expected_date="2026-11-05", meetings_scheduled=2)
        self.assertEqual(response.status_code, 200, response.text)
        entry = response.json()["entry"]
        self.assertEqual((entry["proof_of_work"], entry["expected_date"], entry["meetings_scheduled"]), ("Shared proposal", "2026-11-05", 2))

    def test_forged_filters_and_edits_do_not_expose_another_person(self):
        own = self.sheet(2, "anu").json()["entry"]
        other = self.sheet(2, "ben").json()["entry"]
        headers = self.h(2, "anu")
        response = self.client.get(f"/task-sheet?user_id={other['user_id']}", headers=headers)
        self.assertEqual([entry["id"] for entry in response.json()["entries"]], [own["id"]])
        self.assertEqual(self.client.put(f"/task-sheet/{other['id']}", json=other, headers=headers).status_code, 404)

    def test_negative_counts_invalid_dates_and_foreign_assignees_are_rejected(self):
        for extra in ({"outreaches_count": -1}, {"time_spent_minutes": -1}, {"work_date": "bad"}):
            self.assertEqual(self.sheet(2, "anu", **extra).status_code, 422)
        self.assertEqual(self.sheet(2, "admin", user_id=self.users[3]).status_code, 404)
