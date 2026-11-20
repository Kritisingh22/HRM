/* ============================================================
   Employee Profile — detailed documentation view for a single
   employee. Shows all authorized sections: personal, account,
   employment, salary (payroll roles only) and additional info.

   Accessed from the Employees directory via the View action.
   ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, Pill, StatChip } from '@/components/ui/primitives';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { niceDate } from '@/lib/date';
import { money } from '@/lib/format';
import { getEmployeeProfile, downloadEmployeeProfilePDF } from '@/api/employees';
import { isApiSession } from '@/api/client';
import { canSeeSalary } from '@/data/nav';
import type { EmployeeProfile } from '@/types';

export function EmployeeProfilePage() {
  const { user, canSeeSalary: authCanSeeSalary } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getEmployeeProfile(id);
      const data = (res as any).employee || (res as any);
      setProfile(data as EmployeeProfile);
    } catch (err: any) {
      toast(err?.message || 'Failed to load employee profile.', 'error');
      navigate('/employees');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const canEdit =
    authCanSeeSalary ||
    user?.role === 'HR' ||
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN';
  const canResetPassword = canEdit;
  const showSalary = authCanSeeSalary;

  const notProvided = 'Not provided';

  if (loading) {
    return (
      <div className="grid">
        <section className="card span12">
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>
            <Icon name="clock" size={32} style={{ display: 'block', margin: '0 auto 12px' }} />
            <span className="chip">Loading employee profile…</span>
          </div>
        </section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="grid">
        <section className="card span12">
          <EmptyState
            icon="userMinus"
            title="Employee not found"
            sub="The requested employee record could not be loaded."
            action={
              <button className="btn btn-primary" onClick={() => navigate('/employees')} type="button">
                Back to Employees
              </button>
            }
          />
        </section>
      </div>
    );
  }

  const joinDate = profile.joiningDate ? niceDate(profile.joiningDate) : notProvided;
  const dob = profile.dateOfBirth ? niceDate(profile.dateOfBirth) : notProvided;

  const overviewStats = [
    { k: 'Employee ID', v: profile.employeeId || notProvided },
    { k: 'Department', v: profile.department || notProvided },
    { k: 'Designation', v: profile.designation || notProvided },
    { k: 'Employment Status', v: profile.status || notProvided },
  ];

  const accountStats = profile.user
    ? [
        { k: 'Username', v: profile.user.username || notProvided },
        { k: 'Login Email', v: profile.user.email || notProvided },
        { k: 'Account Role', v: profile.user.role || notProvided },
        { k: 'Account Status', v: profile.user.accountStatus || notProvided },
      ]
    : [
        { k: 'Username', v: notProvided },
        { k: 'Login Email', v: notProvided },
        { k: 'Account Role', v: notProvided },
        { k: 'Account Status', v: notProvided },
      ];

  const salaryStats = showSalary && profile.salary != null
    ? [
        { k: 'Gross Salary', v: money(profile.salary) },
        { k: 'Grade', v: profile.grade || notProvided },
      ]
    : [];

  function downloadProfilePDF() {
    if (!id) return;
    setPdfBusy(true);
    downloadEmployeeProfilePDF(id)
      .then(async (res: any) => {
        const data = res.document || res;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `employee-profile-${profile!.employeeId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast(`Profile data for ${profile!.name} downloaded.`, 'success');
      })
      .catch((err: any) => {
        toast(err?.message || 'Failed to download profile data.', 'error');
      })
      .finally(() => setPdfBusy(false));
  }

  return (
    <div className="grid">
      <section className="card span12">
        <div className="card-head">
          <div>
            <h2>Employee Profile</h2>
            <div className="sub">
              Complete documentation for <b>{profile.name}</b> ({profile.employeeId})
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => window.print()}
              type="button"
            >
              <Icon name="printer" size={14} /> Print
            </button>
            {isApiSession() && (
              <button
                className="btn btn-primary btn-sm"
                disabled={pdfBusy}
                onClick={downloadProfilePDF}
                type="button"
              >
                {pdfBusy ? 'Generating…' : <><Icon name="download" size={14} /> Download PDF</>}
              </button>
            )}
            {canEdit && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => navigate('/employees')}
                type="button"
              >
                Back to Directory
              </button>
            )}
          </div>
        </div>

        {/* Employee Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <Avatar name={profile.name} size={36} seed={profile.name} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>{profile!.name}</h1>
            <p style={{ margin: 4, color: 'var(--text-2)' }}>{profile!.designation || 'Not assigned'} · {profile!.department || 'Not assigned'}</p>
            <p style={{ margin: 4, fontSize: 12, color: 'var(--text-2)' }}>
              Employee ID: <b>{profile!.employeeId}</b>
            </p>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <Pill status={profile.status || 'Active'} />
            <p style={{ margin: 4, fontSize: 12, color: 'var(--text-2)' }}>Employment Status</p>
          </div>
        </div>

        {/* Overview Section */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, color: 'var(--text-1)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            Employee Overview
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {overviewStats.map((s) => (
              <StatChip key={s.k} k={s.k} v={s.v} />
            ))}
          </div>
        </div>

        {/* Personal Details Section */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, color: 'var(--text-1)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            Personal Details
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Full Name</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.name}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Date of Birth</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{dob}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Gender</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.gender || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Personal Email</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.personalEmail || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Phone Number</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.phone || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Address</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.address || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>City / Location</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.city || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Emergency Contact</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.emergencyContact || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Blood Group</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.bloodGroup || notProvided}</dd>
            </div>
          </div>
        </div>

        {/* Account Details Section */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, color: 'var(--text-1)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            Account Details
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {accountStats.map((s) => (
              <StatChip key={s.k} k={s.k} v={s.v} />
            ))}
          </div>
          {profile.user && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
              <p>
                Password setup status:{' '}
                <b>{profile.user.mustChangePassword ? 'Pending — must change at next login' : 'Set'}</b>
              </p>
              {profile.user.isVerified !== undefined && (
                <p>
                  Email verified:{' '}
                  <b>{profile.user.isVerified ? 'Yes' : 'No'}</b>
                </p>
              )}
              {profile.user.lastLogin && (
                <p>
                  Last login:{' '}
                  <b>{niceDate(profile.user.lastLogin)}</b>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Employment Details Section */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, color: 'var(--text-1)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            Employment Details
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Employee ID</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.employeeId}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Department</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.department || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Designation</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.designation || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Reports To</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.manager || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Employment Type</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.employmentType || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Work Mode</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.workMode || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Work Location</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.workLocation || notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Joining Date</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{joinDate}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Grade</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.grade || notProvided}</dd>
            </div>
          </div>
        </div>

        {/* Salary & Compensation Section (HR/Admin only) */}
        {showSalary && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, color: 'var(--text-1)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              Salary &amp; Compensation
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {salaryStats.map((s) => (
                <StatChip key={s.k} k={s.k} v={s.v} />
              ))}
              <div style={{ display: 'contents' }}>
                <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Effective Date</dt>
                <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{joinDate}</dd>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)', padding: 10, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <p style={{ margin: 0, fontStyle: 'italic' }}>
                Salary and compensation details are restricted to authorized HR/Admin roles.
              </p>
            </div>
          </div>
        )}

        {/* Additional Information Section */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, color: 'var(--text-1)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            Additional Information
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Created At</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.createdAt ? niceDate(profile.createdAt) : notProvided}</dd>
            </div>
            <div style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Last Updated</dt>
              <dd style={{ margin: 0, marginBottom: 12, color: 'var(--text-1)' }}>{profile.updatedAt ? niceDate(profile.updatedAt) : notProvided}</dd>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          {canResetPassword && isApiSession() && (
            <button
              className="btn btn-danger-outline btn-sm"
              onClick={() => {
                const target = {
                  id: profile.id,
                  name: profile.name,
                  email: profile.email || '',
                };
                navigate('/employees', { state: { resetTarget: target } });
              }}
              type="button"
            >
              <Icon name="xCircle" size={14} /> Reset Password
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
