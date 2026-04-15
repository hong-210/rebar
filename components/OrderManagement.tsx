
import React, { useState } from 'react';
import { Order, OrderStatus, Project, RebarDiameter, User } from '../types';
import { Calendar as CalendarIcon, List, Plus, Truck, Package, CheckCircle, Circle, MapPin, Trash2, ChevronLeft, ChevronRight, Edit3, PieChart, AlertCircle, Lock } from 'lucide-react';

interface OrderManagementProps {
    currentProject: Project;
    user: User;
    orders: Order[];
    onAddOrder: (order: Order) => void;
    onUpdateOrder: (order: Order) => void;
    onUpdateStatus: (id: string, status: OrderStatus) => void;
    onDeleteOrder: (id: string) => void;
}

export const OrderManagement: React.FC<OrderManagementProps> = ({
    currentProject,
    user,
    orders,
    onAddOrder,
    onUpdateOrder,
    onUpdateStatus,
    onDeleteOrder
}) => {
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Check Permissions
    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';

    // Editing State
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [title, setTitle] = useState('');
    const [dong, setDong] = useState('');
    const [floor, setFloor] = useState('');
    const [diameter, setDiameter] = useState<RebarDiameter>(RebarDiameter.D25);
    const [strength, setStrength] = useState('SD400');
    const [quantity, setQuantity] = useState(0);
    const [orderDate, setOrderDate] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [status, setStatus] = useState<OrderStatus>('RequestApproval');

    // Filter for current project
    const projectOrders = orders.filter(o => o.projectId === currentProject.id);

    // Initialize dong if possible
    React.useEffect(() => {
        if (currentProject.buildings.length > 0 && !dong && !editingId) {
            setDong(currentProject.buildings[0].name);
        }
    }, [currentProject, dong, editingId]);

    const resetForm = () => {
        setTitle('');
        setFloor('');
        setDiameter(RebarDiameter.D25);
        setStrength('SD400');
        setQuantity(0);
        setOrderDate('');
        setDeliveryDate('');
        setStatus('RequestApproval');
        setEditingId(null);
        if (currentProject.buildings.length > 0) {
            setDong(currentProject.buildings[0].name);
        }
    };

    const handleOpenCreate = () => {
        resetForm();
        setIsModalOpen(true);
    };

    const handleOpenEdit = (order: Order) => {
        if (!canEdit) return;
        setEditingId(order.id);
        setTitle(order.title);
        setDong(order.dong);
        setFloor(order.floor);
        setDiameter(order.diameter);
        setStrength(order.strength || 'SD400');
        setQuantity(order.quantityWeight);
        setOrderDate(order.orderDate);
        setDeliveryDate(order.deliveryDate);
        setStatus(order.status);
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (editingId) {
            // Update existing
            const updatedOrder: Order = {
                id: editingId,
                projectId: currentProject.id,
                title,
                dong,
                floor,
                diameter,
                strength,
                quantityWeight: quantity,
                orderDate,
                deliveryDate,
                status
            };
            onUpdateOrder(updatedOrder);
        } else {
            // Create new
            const newOrder: Order = {
                id: Date.now().toString(),
                projectId: currentProject.id,
                title,
                dong,
                floor,
                diameter,
                strength,
                quantityWeight: quantity,
                orderDate,
                deliveryDate,
                status: 'RequestApproval'
            };
            onAddOrder(newOrder);
        }
        
        setIsModalOpen(false);
        resetForm();
    };

    const getStatusColor = (status: OrderStatus) => {
        switch (status) {
            case 'RequestApproval': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'Approved': return 'bg-indigo-50 text-indigo-600 border-indigo-200';
            case 'Rejected': return 'bg-red-50 text-red-600 border-red-200';
            case 'Ordered': return 'bg-purple-50 text-purple-600 border-purple-200';
            case 'Delivered': return 'bg-green-50 text-green-600 border-green-200';
        }
    };

    const getStatusLabel = (status: OrderStatus) => {
        switch (status) {
            case 'RequestApproval': return '승인 요청';
            case 'Approved': return '승인';
            case 'Rejected': return '반려';
            case 'Ordered': return '발주';
            case 'Delivered': return '반입 완료';
        }
    };

    // Calculate Dashboard Metrics
    const totalOrders = projectOrders.length;
    const totalWeight = projectOrders.reduce((acc, o) => acc + o.quantityWeight, 0);
    
    // Status counts and weights
    const statusStats = {
        RequestApproval: projectOrders.filter(o => o.status === 'RequestApproval').reduce((acc, o) => acc + o.quantityWeight, 0),
        Approved: projectOrders.filter(o => o.status === 'Approved').reduce((acc, o) => acc + o.quantityWeight, 0),
        Rejected: projectOrders.filter(o => o.status === 'Rejected').reduce((acc, o) => acc + o.quantityWeight, 0),
        Ordered: projectOrders.filter(o => o.status === 'Ordered').reduce((acc, o) => acc + o.quantityWeight, 0),
        Delivered: projectOrders.filter(o => o.status === 'Delivered').reduce((acc, o) => acc + o.quantityWeight, 0),
    };

    const getPercentage = (weight: number) => totalWeight > 0 ? (weight / totalWeight) * 100 : 0;

    // --- Calendar Logic ---
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentDate(newDate);
    };

    const renderCalendar = () => {
        const days = [];
        // Empty slots for previous month
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="h-32 bg-slate-50/50 border border-slate-100"></div>);
        }

        // Days
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayOrders = projectOrders.filter(o => o.deliveryDate === dateStr || o.orderDate === dateStr);

            days.push(
                <div key={i} className="h-32 bg-white border border-slate-100 p-2 hover:bg-slate-50 transition-colors overflow-y-auto">
                    <div className="text-sm font-bold text-slate-400 mb-2">{i}</div>
                    <div className="space-y-1">
                        {dayOrders.map(order => (
                            <div 
                                key={order.id} 
                                onClick={() => handleOpenEdit(order)}
                                className={`text-[10px] px-1.5 py-1 rounded border truncate cursor-pointer hover:shadow-md transition-shadow ${getStatusColor(order.status)}`}
                                title={`${order.title} (${getStatusLabel(order.status)})`}
                            >
                                {order.deliveryDate === dateStr ? '🚚 ' : '📝 '}{order.title}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return days;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">철근 발주 관리 (Order Management)</h2>
                    <p className="text-slate-500">발주 내역 추적 및 일정 관리</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded transition-all ${viewMode === 'list' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <List size={20} />
                        </button>
                        <button 
                            onClick={() => setViewMode('calendar')}
                            className={`p-2 rounded transition-all ${viewMode === 'calendar' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <CalendarIcon size={20} />
                        </button>
                    </div>
                    {canEdit && (
                        <button 
                            onClick={handleOpenCreate}
                            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all shadow-md font-medium"
                        >
                            <Plus size={20} /> 발주 등록
                        </button>
                    )}
                </div>
            </div>

            {/* Status Summary Dashboard */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Orders</p>
                        <p className="text-2xl font-bold text-slate-800">{totalOrders} <span className="text-sm font-normal text-slate-500">건</span></p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 col-span-2">
                         <p className="text-xs text-blue-500 font-bold uppercase mb-1">Total Applied Volume</p>
                         <div className="flex items-end gap-2">
                             <p className="text-2xl font-bold text-blue-700">{(totalWeight / 1000).toLocaleString()} <span className="text-lg font-normal text-blue-500">ton</span></p>
                             <p className="text-sm text-blue-400 mb-1">({totalWeight.toLocaleString()} kg)</p>
                         </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                        <p className="text-xs text-green-600 font-bold uppercase mb-1">Delivered (반입)</p>
                        <p className="text-2xl font-bold text-green-700">{getPercentage(statusStats.Delivered).toFixed(1)}%</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                     <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                        <span>Pipeline Breakdown (By Weight)</span>
                        <span>100%</span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                        {/* 1. Request Approval */}
                        <div style={{ width: `${getPercentage(statusStats.RequestApproval)}%` }} className="h-full bg-slate-300" title={`승인요청: ${getPercentage(statusStats.RequestApproval).toFixed(1)}%`}></div>
                        {/* 2. Approved */}
                        <div style={{ width: `${getPercentage(statusStats.Approved)}%` }} className="h-full bg-indigo-400" title={`승인: ${getPercentage(statusStats.Approved).toFixed(1)}%`}></div>
                        {/* 3. Ordered */}
                        <div style={{ width: `${getPercentage(statusStats.Ordered)}%` }} className="h-full bg-purple-500" title={`발주: ${getPercentage(statusStats.Ordered).toFixed(1)}%`}></div>
                        {/* 4. Delivered */}
                        <div style={{ width: `${getPercentage(statusStats.Delivered)}%` }} className="h-full bg-green-500" title={`반입완료: ${getPercentage(statusStats.Delivered).toFixed(1)}%`}></div>
                         {/* 5. Rejected (Usually doesn't count towards progress, but visual is fine) */}
                        <div style={{ width: `${getPercentage(statusStats.Rejected)}%` }} className="h-full bg-red-400" title={`반려: ${getPercentage(statusStats.Rejected).toFixed(1)}%`}></div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs mt-2 justify-center">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span> 승인 요청</div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span> 승인</div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> 발주</div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500"></span> 반입 완료</div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400"></span> 반려</div>
                    </div>
                </div>
            </div>

            {/* LIST VIEW */}
            {viewMode === 'list' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-3 text-left">Status</th>
                                <th className="px-6 py-3 text-left">Title / Location</th>
                                <th className="px-6 py-3 text-center">DIA</th>
                                <th className="px-6 py-3 text-center">GRADE</th>
                                <th className="px-6 py-3 text-right">Quantity (kg)</th>
                                <th className="px-6 py-3 text-center">Schedule</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {projectOrders.map(order => (
                                <tr key={order.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <select 
                                            value={order.status}
                                            onChange={(e) => canEdit && onUpdateStatus(order.id, e.target.value as OrderStatus)}
                                            className={`text-xs font-bold px-2 py-1 rounded border outline-none ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'} ${getStatusColor(order.status)}`}
                                            disabled={!canEdit}
                                        >
                                            <option value="RequestApproval">승인 요청</option>
                                            <option value="Approved">승인</option>
                                            <option value="Rejected">반려</option>
                                            <option value="Ordered">발주</option>
                                            <option value="Delivered">반입 완료</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{order.title}</div>
                                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                                            <MapPin size={12} />
                                            {order.dong} {order.floor}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-slate-600">
                                        {order.diameter}
                                    </td>
                                    <td className="px-6 py-4 text-center text-slate-500 font-mono">
                                        {order.strength || 'SD400'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-blue-600">
                                        {order.quantityWeight.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-center text-xs">
                                        <div className="text-slate-500">Order: {order.orderDate}</div>
                                        <div className="text-slate-800 font-medium">Due: {order.deliveryDate}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {canEdit ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => handleOpenEdit(order)}
                                                    className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                                    title="수정"
                                                >
                                                    <Edit3 size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => {if(window.confirm('삭제하시겠습니까?')) onDeleteOrder(order.id)}}
                                                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                    title="삭제"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-300 flex items-center justify-end gap-1"><Lock size={12}/> View Only</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {projectOrders.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-slate-400">
                                        등록된 발주 내역이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* CALENDAR VIEW */}
            {viewMode === 'calendar' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Calendar Header */}
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white rounded-full text-slate-500"><ChevronLeft size={20} /></button>
                        <h3 className="text-lg font-bold text-slate-800">
                            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                        </h3>
                        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white rounded-full text-slate-500"><ChevronRight size={20} /></button>
                    </div>
                    
                    {/* Weekdays */}
                    <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-500 text-center py-2">
                        <div className="text-red-400">SUN</div>
                        <div>MON</div>
                        <div>TUE</div>
                        <div>WED</div>
                        <div>THU</div>
                        <div>FRI</div>
                        <div className="text-blue-400">SAT</div>
                    </div>

                    {/* Days */}
                    <div className="grid grid-cols-7">
                        {renderCalendar()}
                    </div>
                    
                    <div className="p-4 flex flex-wrap gap-4 text-xs border-t border-slate-100 justify-center">
                         <div className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-100 border border-slate-200 rounded"></span> 승인요청</div>
                         <div className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-50 border border-indigo-200 rounded"></span> 승인</div>
                         <div className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-50 border border-purple-200 rounded"></span> 발주</div>
                         <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 border border-green-200 rounded"></span> 반입완료</div>
                         <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-50 border border-red-200 rounded"></span> 반려</div>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200">
                         <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? '발주 정보 수정' : '신규 발주 등록'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">발주명 (Title)</label>
                                <input 
                                    required
                                    type="text" 
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="예: B2F 옹벽 및 기둥 1차"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">동 (Building)</label>
                                    <select 
                                        value={dong}
                                        onChange={e => setDong(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                    >
                                        {currentProject.buildings.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">층/위치 (Floor)</label>
                                    <input 
                                        type="text" 
                                        value={floor}
                                        onChange={e => setFloor(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                        placeholder="예: B2F"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">직경 (DIA)</label>
                                    <select 
                                        value={diameter}
                                        onChange={e => setDiameter(e.target.value as RebarDiameter)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                    >
                                        {Object.values(RebarDiameter).map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">강종 (Grade)</label>
                                    <select 
                                        value={strength}
                                        onChange={e => setStrength(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                    >
                                        {['SD300','SD400','SD500','SD600'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">물량 (Weight kg)</label>
                                <input 
                                    type="number" 
                                    value={quantity}
                                    onChange={e => setQuantity(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">발주 일자</label>
                                    <input 
                                        type="date" 
                                        required
                                        value={orderDate}
                                        onChange={e => setOrderDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">반입 예정일</label>
                                    <input 
                                        type="date" 
                                        required
                                        value={deliveryDate}
                                        onChange={e => setDeliveryDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-all">
                                    {editingId ? '수정 완료' : '발주 등록'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
