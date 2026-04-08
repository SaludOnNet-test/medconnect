'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { providers, insuranceCompanies, isSlotAvailable } from '@/data/mock';
import './admin.css';

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Booking state
  const [bookings, setBookings] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newEmailInputId, setNewEmailInputId] = useState(null);
  const [newEmailValue, setNewEmailValue] = useState('');

  // Filters state
  const [filters, setFilters] = useState({
    clinic: '',
    specialty: '',
    city: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    priority: '',
    amountMin: '',
    amountMax: '',
  });

  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
      router.push('/admin/login');
    } else {
      setIsLoading(false);
    }
  }, [router]);

  // Initialize mock bookings
  useEffect(() => {
    setBookings([
      { id: 1, patient: 'María García', doctor: 'Dr. López', clinic: 'Hospital HM Sanchinarro', specialty: 'Traumatología', city: 'Madrid', date: '2026-04-08', time: '10:00', status: 'confirmed', amount: 25.00 },
      { id: 2, patient: 'Juan Pérez', doctor: 'Dr. Martínez', clinic: 'Clínica Teknon', specialty: 'Cardiología', city: 'Barcelona', date: '2026-04-09', time: '14:30', status: 'confirmed', amount: 9.99 },
      { id: 3, patient: 'Ana Rodríguez', doctor: 'Dr. García', clinic: 'Hospital Quirónsalud Valencia', specialty: 'Dermatología', city: 'Valencia', date: '2026-04-11', time: '11:15', status: 'pending', amount: 9.99 },
      { id: 4, patient: 'Carlos López', doctor: 'Dr. López', clinic: 'Hospital HM Sanchinarro', specialty: 'Traumatología', city: 'Madrid', date: '2026-04-14', time: '16:00', status: 'pending', amount: 0.99 },
      { id: 5, patient: 'Elena Sánchez', doctor: 'Dr. Martínez', clinic: 'Clínica Teknon', specialty: 'Cardiología', city: 'Barcelona', date: '2026-04-05', time: '09:30', status: 'completed', amount: 9.99 },
      { id: 6, patient: 'David Fernández', doctor: 'Dr. Rodríguez', clinic: 'Hospital Vithas Sevilla', specialty: 'Digestivo', city: 'Sevilla', date: '2026-04-03', time: '13:00', status: 'cancelled', amount: 25.00 },
    ]);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminLoggedIn');
    router.push('/admin/login');
  };

  if (isLoading) {
    return <div className="admin-loading">Cargando...</div>;
  }

  // Mock data
  const mockMetrics = { activeUsers: 1247, patients: 1150, doctors: 97, bookingsThisMonth: 487, revenue: 7305.50, averageBookingValue: 15.00 };

  const mockPendingDoctors = providers.slice(0, 3).map((doc, idx) => ({
    id: idx + 1,
    name: doc.name,
    specialty: doc.specialtyIds?.[0] ? `Specialty ${doc.specialtyIds[0]}` : 'General',
    submittedAt: new Date(Date.now() - (idx + 1) * 86400000 * 2).toLocaleDateString('es-ES'),
    status: 'pending'
  }));

  const mockSupportTickets = [
    { id: 1, subject: 'Problema con el pago', priority: 'high', status: 'open', created: 'Hace 2 horas', clinic: 'Hospital HM Sanchinarro' },
    { id: 2, subject: 'Solicitud de cancelación de cita', priority: 'medium', status: 'in_progress', created: 'Hace 5 horas', clinic: 'Clínica Teknon' },
    { id: 3, subject: 'Pregunta sobre verificación médico', priority: 'medium', status: 'open', created: 'Hace 1 día', clinic: 'Hospital Quirónsalud Valencia' },
    { id: 4, subject: 'Error técnico al reservar', priority: 'high', status: 'open', created: 'Hace 2 días', clinic: 'Hospital HM Sanchinarro' },
    { id: 5, subject: 'Solicitud de devolución', priority: 'medium', status: 'resolved', created: 'Hace 3 días', clinic: 'Hospital Vithas Sevilla' },
  ];

  const revenueData = [
    { day: 'Lun', revenue: 980, bookings: 42 },
    { day: 'Mar', revenue: 1250, bookings: 51 },
    { day: 'Mié', revenue: 890, bookings: 38 },
    { day: 'Jue', revenue: 1480, bookings: 62 },
    { day: 'Vie', revenue: 1705, bookings: 72 },
  ];

  // --- Filters ---
  const updateFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const clearFilters = () => setFilters({ clinic: '', specialty: '', city: '', status: '', dateFrom: '', dateTo: '', priority: '', amountMin: '', amountMax: '' });

  const applyBookingFilters = (list) => list.filter(b => {
    if (filters.clinic && !b.clinic?.toLowerCase().includes(filters.clinic.toLowerCase())) return false;
    if (filters.specialty && b.specialty !== filters.specialty) return false;
    if (filters.city && b.city !== filters.city) return false;
    if (filters.status && b.status !== filters.status) return false;
    if (filters.dateFrom && b.date < filters.dateFrom) return false;
    if (filters.dateTo && b.date > filters.dateTo) return false;
    if (filters.amountMin && b.amount < Number(filters.amountMin)) return false;
    if (filters.amountMax && b.amount > Number(filters.amountMax)) return false;
    return true;
  });

  const applySupportFilters = (list) => list.filter(t => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.clinic && !t.clinic?.toLowerCase().includes(filters.clinic.toLowerCase())) return false;
    return true;
  });

  const filteredBookings = applyBookingFilters(bookings);
  const filteredTickets = applySupportFilters(mockSupportTickets);

  // --- Booking Edit ---
  const openEditModal = (booking) => {
    setEditingBooking(booking);
    setEditForm({
      date: booking.date,
      time: booking.time,
      clinic: booking.clinic,
      amount: booking.amount,
      notes: '',
    });
    setShowEditModal(true);
  };

  const handleEditSave = () => {
    const updated = { ...editingBooking, ...editForm, status: 'pending_patient_approval' };
    setBookings(prev => prev.map(b => b.id === editingBooking.id ? updated : b));
    console.log(`📧 Email al paciente (${editingBooking.patient}): Su cita ha sido modificada a ${editForm.date} ${editForm.time} en ${editForm.clinic}. Tiene 24h para confirmar, proponer otra fecha o solicitar devolución.`);
    alert(`✅ Booking actualizado. Email enviado al paciente con opciones de confirmación.`);
    setShowEditModal(false);
    setEditingBooking(null);
  };

  const handlePatientAction = (bookingId, action) => {
    const statusMap = {
      confirm: 'confirmed',
      propose: 'awaiting_patient_proposal',
      refund: 'refund_requested',
    };
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: statusMap[action] } : b));
  };

  // --- Lock-in Actions ---
  const handleResendLockIn = (bookingId, patientEmail) => {
    console.log(`📧 Reenviado lock-in a ${patientEmail} - Reserva #${bookingId}`);
    alert(`✅ Lock-in reenviado a ${patientEmail}`);
  };

  const handleSendNewEmail = (bookingId) => {
    if (!newEmailValue.trim()) return;
    console.log(`📧 Lock-in enviado a nuevo correo ${newEmailValue} - Reserva #${bookingId}`);
    alert(`✅ Lock-in enviado a ${newEmailValue}`);
    setNewEmailInputId(null);
    setNewEmailValue('');
  };

  // --- Filter Bar Component (inline) ---
  const FilterBar = ({ type }) => (
    <div className="admin-filter-bar">
      <div className="admin-filter-row">
        <input
          type="text"
          placeholder="Clínica / Centro"
          value={filters.clinic}
          onChange={e => updateFilter('clinic', e.target.value)}
          className="filter-input"
        />
        {(type === 'bookings' || type === 'finance') && (
          <select value={filters.specialty} onChange={e => updateFilter('specialty', e.target.value)} className="filter-select">
            <option value="">Especialidad</option>
            <option value="Traumatología">Traumatología</option>
            <option value="Dermatología">Dermatología</option>
            <option value="Cardiología">Cardiología</option>
            <option value="Digestivo">Digestivo</option>
            <option value="Ginecología">Ginecología</option>
          </select>
        )}
        <select value={filters.city} onChange={e => updateFilter('city', e.target.value)} className="filter-select">
          <option value="">Provincia / Ciudad</option>
          <option value="Madrid">Madrid</option>
          <option value="Barcelona">Barcelona</option>
          <option value="Valencia">Valencia</option>
          <option value="Sevilla">Sevilla</option>
          <option value="Málaga">Málaga</option>
        </select>
        {(type === 'bookings' || type === 'support') && (
          <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="filter-select">
            <option value="">Estado</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="pending_patient_approval">Pend. Aprobación</option>
            <option value="refund_requested">Dev. Solicitada</option>
            {type === 'support' && <option value="open">Open</option>}
            {type === 'support' && <option value="in_progress">In Progress</option>}
            {type === 'support' && <option value="resolved">Resolved</option>}
          </select>
        )}
        {type === 'bookings' && (
          <>
            <input type="date" value={filters.dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)} className="filter-input" title="Desde" />
            <input type="date" value={filters.dateTo} onChange={e => updateFilter('dateTo', e.target.value)} className="filter-input" title="Hasta" />
          </>
        )}
        {type === 'finance' && (
          <>
            <input type="number" placeholder="€ Mín" value={filters.amountMin} onChange={e => updateFilter('amountMin', e.target.value)} className="filter-input" style={{ width: 80 }} />
            <input type="number" placeholder="€ Máx" value={filters.amountMax} onChange={e => updateFilter('amountMax', e.target.value)} className="filter-input" style={{ width: 80 }} />
          </>
        )}
        {type === 'support' && (
          <select value={filters.priority} onChange={e => updateFilter('priority', e.target.value)} className="filter-select">
            <option value="">Prioridad</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        )}
        <button className="btn-small" onClick={clearFilters} style={{ background: '#f3f4f6', color: '#4b5563' }}>
          Limpiar
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-content">
          <h1>Med Connect Admin Dashboard</h1>
          <div className="admin-header-actions">
            <span className="admin-user-badge">Admin</span>
            <button onClick={handleLogout} className="btn-logout">Logout</button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-tabs">
          <button className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>📊 Overview</button>
          <button className={`admin-tab ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>✓ Aprobaciones</button>
          <button className={`admin-tab ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>📅 Reservas</button>
          <button className={`admin-tab ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>💰 Finanzas</button>
          <button className={`admin-tab ${activeTab === 'support' ? 'active' : ''}`} onClick={() => setActiveTab('support')}>💬 Soporte</button>
        </div>

        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="admin-tab-content">
            <h2>Dashboard Overview</h2>
            <div className="admin-metrics-grid">
              <div className="admin-metric-card">
                <div className="metric-label">Usuarios Activos</div>
                <div className="metric-value">{mockMetrics.activeUsers}</div>
                <div className="metric-breakdown">👥 Pacientes: {mockMetrics.patients} | 👨‍⚕️ Médicos: {mockMetrics.doctors}</div>
              </div>
              <div className="admin-metric-card">
                <div className="metric-label">Reservas este mes</div>
                <div className="metric-value">{mockMetrics.bookingsThisMonth}</div>
                <div className="metric-breakdown">+12% respecto al mes anterior</div>
              </div>
              <div className="admin-metric-card">
                <div className="metric-label">Ingresos Totales</div>
                <div className="metric-value">€{mockMetrics.revenue.toFixed(2)}</div>
                <div className="metric-breakdown">Media: €{mockMetrics.averageBookingValue}/reserva</div>
              </div>
              <div className="admin-metric-card">
                <div className="metric-label">Aprobaciones Pendientes</div>
                <div className="metric-value">{mockPendingDoctors.length}</div>
                <div className="metric-breakdown">{mockPendingDoctors.length} médicos esperando</div>
              </div>
            </div>
            <div className="admin-section">
              <h3>Ingresos Semanales</h3>
              <div className="simple-chart">
                {revenueData.map((day, idx) => (
                  <div key={idx} className="chart-bar" style={{ height: `${(day.revenue / 1705) * 200}px` }}>
                    <div className="chart-label">{day.day}</div>
                    <div className="chart-value">€{day.revenue}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: DOCTOR APPROVALS */}
        {activeTab === 'approvals' && (
          <div className="admin-tab-content">
            <h2>Aprobaciones de Médicos</h2>
            <p className="admin-subtitle">Revisa y aprueba las solicitudes de registro de médicos</p>
            <FilterBar type="approvals" />
            {mockPendingDoctors.length === 0 ? (
              <div className="admin-empty-state">No hay aprobaciones pendientes</div>
            ) : (
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Especialidad</th>
                      <th>Fecha Solicitud</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockPendingDoctors.map((doc) => (
                      <tr key={doc.id}>
                        <td><strong>{doc.name}</strong></td>
                        <td>{doc.specialty}</td>
                        <td>{doc.submittedAt}</td>
                        <td>
                          <button className="btn-small btn-success">Aprobar</button>
                          <button className="btn-small btn-danger">Rechazar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: BOOKINGS */}
        {activeTab === 'bookings' && (
          <div className="admin-tab-content">
            <h2>Gestión de Reservas</h2>
            <FilterBar type="bookings" />
            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Médico / Clínica</th>
                    <th>Fecha y Hora</th>
                    <th>Importe</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.patient}</td>
                      <td>
                        <span>{booking.doctor}</span>
                        <br />
                        <small style={{ color: '#6b7280' }}>{booking.clinic}</small>
                      </td>
                      <td>{booking.date} a las {booking.time}</td>
                      <td>€{booking.amount.toFixed(2)}</td>
                      <td>
                        <span className={`status-badge status-${booking.status}`}>
                          {booking.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <button className="btn-small" onClick={() => openEditModal(booking)}>Editar</button>
                          {(booking.status === 'pending' || booking.status === 'pending_patient_approval') && (
                            <>
                              <button className="btn-small btn-success" onClick={() => handleResendLockIn(booking.id, booking.patient)}>
                                Reenviar
                              </button>
                              <button className="btn-small" onClick={() => setNewEmailInputId(newEmailInputId === booking.id ? null : booking.id)}>
                                Nuevo email
                              </button>
                            </>
                          )}
                          {booking.status === 'pending_patient_approval' && (
                            <div style={{ display: 'flex', gap: '2px' }}>
                              <button className="btn-small btn-success" onClick={() => handlePatientAction(booking.id, 'confirm')} title="Confirmar cambio">✓</button>
                              <button className="btn-small" onClick={() => handlePatientAction(booking.id, 'propose')} title="Proponer alternativa">↔</button>
                              <button className="btn-small btn-danger" onClick={() => handlePatientAction(booking.id, 'refund')} title="Dev. solicitada">€</button>
                            </div>
                          )}
                          {newEmailInputId === booking.id && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                              <input
                                type="email"
                                placeholder="nuevo@email.com"
                                value={newEmailValue}
                                onChange={e => setNewEmailValue(e.target.value)}
                                style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                              />
                              <button className="btn-small btn-success" onClick={() => handleSendNewEmail(booking.id)}>→</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: FINANCE */}
        {activeTab === 'finance' && (
          <div className="admin-tab-content">
            <h2>Panel Financiero</h2>
            <FilterBar type="finance" />
            <div className="admin-metrics-grid">
              <div className="admin-metric-card">
                <div className="metric-label">Ingresos Totales</div>
                <div className="metric-value">€7,305.50</div>
              </div>
              <div className="admin-metric-card">
                <div className="metric-label">Pagos a Médicos</div>
                <div className="metric-value">€3,652.75</div>
              </div>
              <div className="admin-metric-card">
                <div className="metric-label">Comisión Plataforma</div>
                <div className="metric-value">€3,652.75</div>
              </div>
              <div className="admin-metric-card">
                <div className="metric-label">Margen Bruto</div>
                <div className="metric-value">50.0%</div>
              </div>
            </div>
            <div className="admin-section">
              <h3>Seguimiento de Comisiones</h3>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Médico</th>
                      <th>Reservas</th>
                      <th>Comisión Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Dr. López</td>
                      <td>12</td>
                      <td>€450.00</td>
                      <td><span className="status-badge status-pending">Pendiente de Pago</span></td>
                    </tr>
                    <tr>
                      <td>Dr. Martínez</td>
                      <td>8</td>
                      <td>€300.00</td>
                      <td><span className="status-badge status-completed">Pagado</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SUPPORT */}
        {activeTab === 'support' && (
          <div className="admin-tab-content">
            <h2>Tickets de Soporte</h2>
            <FilterBar type="support" />
            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Asunto</th>
                    <th>Clínica</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>{ticket.subject}</td>
                      <td><small>{ticket.clinic}</small></td>
                      <td>
                        <span className={`priority-badge priority-${ticket.priority}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-${ticket.status}`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{ticket.created}</td>
                      <td>
                        <button className="btn-small">Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Edit Booking Modal */}
      {showEditModal && editingBooking && (
        <div className="admin-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>Editar Reserva #{editingBooking.id}</h3>
              <button className="admin-modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                Paciente: <strong>{editingBooking.patient}</strong>
              </p>
              <div className="admin-form-group">
                <label>Nueva Fecha</label>
                <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="filter-input" style={{ width: '100%' }} />
              </div>
              <div className="admin-form-group">
                <label>Nueva Hora</label>
                <input type="time" value={editForm.time} onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} className="filter-input" style={{ width: '100%' }} />
              </div>
              <div className="admin-form-group">
                <label>Clínica / Centro</label>
                <select value={editForm.clinic} onChange={e => setEditForm(f => ({ ...f, clinic: e.target.value }))} className="filter-select" style={{ width: '100%' }}>
                  {providers.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div className="admin-form-group">
                <label>Precio (€)</label>
                <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: Number(e.target.value) }))} className="filter-input" style={{ width: '100%' }} />
              </div>
              <div className="admin-form-group">
                <label>Notas internas</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="filter-input" rows={3} style={{ width: '100%', resize: 'vertical' }} />
              </div>
              <div style={{ background: '#fef3c7', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: '#92400e', marginTop: '0.5rem' }}>
                ⚠️ Al guardar, se enviará un email al paciente con 3 opciones: confirmar el cambio, proponer otra fecha o solicitar devolución (≤72h hábiles).
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-small" onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="btn-small btn-success" onClick={handleEditSave}>Guardar y notificar paciente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
