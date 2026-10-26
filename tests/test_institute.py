"""institute add-on (ported from SCM HB): gated, role-checked, tenant-isolated, and working end to end."""
import unittest
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from tests import _support as S
from tests._fixtures import TenantIsolationBase
from database import Lead, User
from modules import features, presets, tenant_settings


class InstituteBase(TenantIsolationBase):
    def setUp(self):
        super().setUp()
        features.invalidate()
        tenant_settings.invalidate()
        self.addCleanup(features.invalidate)
        self.addCleanup(tenant_settings.invalidate)
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 2, "institute")
            tenant_settings.update_settings(s, 2, {"lead_intake_api_key": "alpha-intake-key"})
            emp = User(email="emp@t2.test", password="x", name="Emp Two", role="Employee", tenant_id=2)
            sales = User(email="sales@t2.test", password="x", name="Sales Two", role="SalesManager", tenant_id=2)
            s.add(emp)
            s.add(sales)
            s.commit()
            s.refresh(emp)
            s.refresh(sales)
            self.emp, self.sales = emp.id, sales.id

    def h(self, uid=None, tid=2):
        return {"X-User-ID": str(uid or self.users[tid])}

    def get(self, path, uid=None, tid=2):
        return self.client.get(path, headers=self.h(uid, tid))

    def post(self, path, body, uid=None, tid=2):
        return self.client.post(path, json=body, headers=self.h(uid, tid))

    def patch(self, path, body, uid=None, tid=2):
        return self.client.patch(path, json=body, headers=self.h(uid, tid))

    # builders -------------------------------------------------------------------------------
    def make_course(self, title="Python 101", price=1000.0, tid=2):
        r = self.post("/courses", {"title": title, "price": price, "advance_amount": 100.0, "category": "Tech"}, tid=tid)
        self.assertEqual(r.status_code, 200, r.text)
        return self._id(r.json(), "course")

    @staticmethod
    def _id(body, key):
        if isinstance(body, dict):
            if key in body and isinstance(body[key], dict):
                return body[key]["id"]
            if "id" in body:
                return body["id"]
        raise AssertionError(f"no id in {body}")

    def make_instructor(self, name="Ms Rao"):
        r = self.post("/instructors", {"name": name, "email": "rao@x.test", "expertise": "Python"})
        self.assertEqual(r.status_code, 200, r.text)
        return self._id(r.json(), "instructor")

    def make_batch(self, course_id, instructor_id=None, name="Batch A"):
        r = self.post("/batches", {"course_id": course_id, "instructor_id": instructor_id, "batch_name": name,
                                   "start_date": "2026-11-01", "end_date": "2026-12-20", "max_seats": 20})
        self.assertEqual(r.status_code, 200, r.text)
        return self._id(r.json(), "batch")

    def make_student(self, name="Asha Student", **extra):
        r = self.post("/students", {"name": name, "email": "asha@x.test", "phone": "9999999999", **extra})
        self.assertEqual(r.status_code, 200, r.text)
        return self._id(r.json(), "student")


class Gating(InstituteBase):
    def test_tenants_without_the_module_get_403(self):
        for path in ("/courses", "/instructors", "/batches", "/students", "/enrollments", "/institute/analytics",
                     "/student-portal/learning", "/schedule/upcoming"):
            r = self.get(path, tid=3)
            self.assertEqual(r.status_code, 403, path)
            self.assertEqual(r.json()["feature"], "institute", path)

    def test_enabled_tenant_can_list(self):
        for path in ("/courses", "/instructors", "/batches", "/students", "/enrollments"):
            self.assertEqual(self.get(path).status_code, 200, path)


class Roles(InstituteBase):
    def test_only_admin_manages_courses_and_instructors(self):
        self.assertEqual(self.post("/courses", {"title": "X", "price": 1}, uid=self.emp).status_code, 403)
        self.assertEqual(self.post("/instructors", {"name": "X"}, uid=self.sales).status_code, 403)
        cid = self.make_course()
        self.assertEqual(self.client.delete(f"/courses/{cid}", headers=self.h(self.emp)).status_code, 403)
        self.assertEqual(self.client.delete(f"/courses/{cid}", headers=self.h()).status_code, 200)

    def test_a_client_role_cannot_use_the_institute_apis(self):
        with Session(S.ENGINE) as s:
            c = User(email="cl@t2.test", password="x", name="Client", role="Client", tenant_id=2)
            s.add(c)
            s.commit()
            s.refresh(c)
        for path in ("/courses", "/students", "/institute/analytics"):
            self.assertEqual(self.get(path, uid=c.id).status_code, 403, path)


class CoreFlow(InstituteBase):
    def test_course_batch_student_enrollment_payment_attendance(self):
        cid = self.make_course()
        iid = self.make_instructor()
        bid = self.make_batch(cid, iid)
        sid = self.make_student()
        self.assertIn("Python 101", str(self.get("/courses").json()))
        self.assertIn("Batch A", str(self.get("/batches").json()))
        b = self.get(f"/batches/{bid}")
        self.assertEqual(b.status_code, 200, b.text)

        r = self.post("/enrollments", {"student_id": sid, "batch_id": bid, "course_id": cid, "total_fee": 1000.0,
                                       "amount_paid": 100.0, "payment_mode": "Cash"})
        self.assertEqual(r.status_code, 200, r.text)
        enr = self._id(r.json(), "enrollment")
        r = self.post("/payments", {"enrollment_id": enr, "student_id": sid, "amount": 400.0, "payment_mode": "UPI"})
        self.assertEqual(r.status_code, 200, r.text)
        listing = self.get("/enrollments").json()
        self.assertIn("500", str(listing).replace(".0", ""))

        r = self.post("/attendance", {"batch_id": bid, "student_id": sid, "date": "2026-11-02", "status": "Present"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.get(f"/attendance?batch_id={bid}&date=2026-11-02").status_code, 200)

        detail = self.get(f"/students/{sid}")
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertIn("Asha Student", str(detail.json()))
        self.assertEqual(self.get("/institute/analytics").status_code, 200)
        self.assertEqual(self.get("/institute/team-performance").status_code, 200)

    def test_class_sessions_attendance_and_progress(self):
        cid = self.make_course()
        iid = self.make_instructor()
        bid = self.make_batch(cid, iid)
        sid = self.make_student()
        self.post(f"/batches/{bid}/students", {"student_ids": [sid]})
        start = datetime.now(timezone.utc) + timedelta(days=1)
        r = self.post(f"/batches/{bid}/sessions", {"title": "Intro", "topic": "Basics", "scheduled_start": start.isoformat(),
                                                   "scheduled_end": (start + timedelta(hours=1)).isoformat()})
        self.assertEqual(r.status_code, 200, r.text)
        sess = r.json()
        sess_id = sess.get("id") or sess.get("session", {}).get("id")
        self.assertTrue(sess_id, sess)
        self.assertEqual(self.get(f"/batches/{bid}/sessions").status_code, 200)
        self.assertEqual(self.post(f"/institute-sessions/{sess_id}/attendance", {"student_id": sid, "status": "Present"}).status_code, 200)
        r = self.post(f"/institute-sessions/{sess_id}/progress", {"student_id": sid, "status": "Completed", "completion_percent": 100})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.patch(f"/institute-sessions/{sess_id}", {"status": "Completed"}).status_code, 200)

    def test_student_notes_and_login_and_portal(self):
        cid = self.make_course()
        bid = self.make_batch(cid, self.make_instructor())
        sid = self.make_student()
        self.post(f"/batches/{bid}/students", {"student_ids": [sid]})
        self.assertEqual(self.post(f"/students/{sid}/notes", {"content": "Called parents"}).status_code, 200)
        self.assertIn("Called parents", str(self.get(f"/students/{sid}/notes").json()))
        r = self.post(f"/students/{sid}/login", {"password": "student-pass-1"})
        self.assertEqual(r.status_code, 200, r.text)
        login = self.client.post("/login", json={"email": "asha@x.test", "password": "student-pass-1"})
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["user"]["role"], "Student")
        token = {"Authorization": f"Bearer {login.json()['token']}"}
        portal = self.client.get("/student-portal/learning", headers=token)
        self.assertEqual(portal.status_code, 200, portal.text[:300])
        # a student cannot manage the institute
        self.assertEqual(self.client.post("/courses", json={"title": "Hack", "price": 0}, headers=token).status_code, 403)
        self.assertEqual(self.client.get("/institute/analytics", headers=token).status_code, 403)

    def test_instructor_login_and_teaching_portal(self):
        iid = self.make_instructor()
        r = self.post(f"/instructors/{iid}/login", {"password": "instr-pass-1"})
        self.assertEqual(r.status_code, 200, r.text)
        login = self.client.post("/login", json={"email": "rao@x.test", "password": "instr-pass-1"})
        self.assertEqual(login.status_code, 200, login.text)
        token = {"Authorization": f"Bearer {login.json()['token']}"}
        self.assertEqual(self.client.get("/instructor-portal/teaching", headers=token).status_code, 200)


class Isolation(InstituteBase):
    def test_other_tenants_with_the_module_never_see_these_rows(self):
        with Session(S.ENGINE) as s:
            presets.apply_preset(s, 3, "institute")
        cid = self.make_course("Secret Course")
        sid = self.make_student("Secret Student")
        self.assertNotIn("Secret", str(self.get("/courses", tid=3).json()))
        self.assertNotIn("Secret", str(self.get("/students", tid=3).json()))
        self.assertIn(self.get(f"/students/{sid}", tid=3).status_code, (403, 404))
        self.assertIn(self.client.delete(f"/courses/{cid}", headers=self.h(tid=3)).status_code, (403, 404))
        self.assertIn(self.post("/enrollments", {"student_id": sid, "batch_id": 1, "course_id": cid}, tid=3).status_code, (400, 403, 404))


class LeadAdmissions(InstituteBase):
    def setUp(self):
        super().setUp()
        with Session(S.ENGINE) as s:
            lead = s.exec(select(Lead).where(Lead.id == self.leads[2])).one()
            lead.owner_id = self.sales
            s.add(lead)
            s.commit()

    def test_demo_walkin_webinar_followup_and_schedule(self):
        lid = self.leads[2]
        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        for path in ("demo-sessions", "walk-ins", "webinars", "follow-ups"):
            r = self.post(f"/leads/{lid}/{path}", {"scheduled_at": when, "notes": "n"}, uid=self.sales)
            self.assertEqual(r.status_code, 200, (path, r.text[:300]))
        self.assertEqual(self.get(f"/leads/{lid}/demo-sessions", uid=self.sales).status_code, 200)
        r = self.get("/schedule/upcoming", uid=self.sales)
        self.assertEqual(r.status_code, 200, r.text[:300])
        self.assertEqual(self.get("/leads/sources/analytics", uid=self.sales).status_code, 200)

    def test_status_change_and_convert_to_student(self):
        lid = self.leads[2]
        cid = self.make_course()
        bid = self.make_batch(cid, self.make_instructor())
        r = self.patch(f"/leads/{lid}/status", {"status": "Contacted"}, uid=self.sales)
        self.assertEqual(r.status_code, 200, r.text[:300])
        r = self.post(f"/leads/{lid}/convert-to-student", {"batch_id": bid}, uid=self.sales)
        self.assertEqual(r.status_code, 200, r.text[:400])
        with Session(S.ENGINE) as s:
            self.assertIsNotNone(s.exec(select(Lead).where(Lead.id == lid)).one().converted_student_id)

    def test_cannot_touch_another_tenants_lead(self):
        r = self.post(f"/leads/{self.leads[3]}/demo-sessions", {"scheduled_at": datetime.now(timezone.utc).isoformat()}, uid=self.sales)
        self.assertIn(r.status_code, (403, 404))


class Intake(InstituteBase):
    BODY = {"name": "Web Lead", "email": "web@x.test", "phone": "8888888888", "course": "Python 101"}

    def test_needs_the_tenants_key(self):
        self.make_course()
        # no key, wrong key, other tenant's id: all refused
        self.assertEqual(self.client.post("/leads/intake", json={**self.BODY, "tenant_id": 2}).status_code, 401)
        self.assertEqual(self.client.post("/leads/intake", json={**self.BODY, "tenant_id": 2, "api_key": "nope"}).status_code, 401)
        self.assertEqual(self.client.post("/leads/intake", json={**self.BODY, "api_key": "alpha-intake-key"}).status_code, 400)
        # tenant 3 never configured a key: closed even if the caller guesses
        self.assertEqual(self.client.post("/leads/intake", json={**self.BODY, "tenant_id": 3, "api_key": "alpha-intake-key"}).status_code, 401)

    def test_valid_key_creates_a_lead_in_that_tenant_only(self):
        self.make_course()
        r = self.client.post("/leads/intake", json={**self.BODY, "tenant_id": 2}, headers={"X-API-Key": "alpha-intake-key"})
        self.assertEqual(r.status_code, 200, r.text[:300])
        with Session(S.ENGINE) as s:
            lead = s.exec(select(Lead).where(Lead.email == "web@x.test").execution_options(skip_tenant=True)).one()
            self.assertEqual(lead.tenant_id, 2)

    def test_closed_when_the_module_is_switched_off(self):
        with Session(S.ENGINE) as s:
            features.set_features(s, 2, {"institute": False})
        r = self.client.post("/leads/intake", json={**self.BODY, "tenant_id": 2, "api_key": "alpha-intake-key"})
        self.assertEqual(r.status_code, 403)


if __name__ == "__main__":
    unittest.main()
