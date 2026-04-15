
import React, { useState } from 'react';
import { Project, User, ProjectRole } from '../types';
import { Users, Shield, UserCog, Share2, Search, Trash2, X } from 'lucide-react';

interface MemberManagementProps {
    currentProject: Project;
    user: User; // Current logged-in user
    onUpdateRole: (projectId: string, userId: string, newRole: ProjectRole) => void;
    onRemoveMember: (projectId: string, userId: string) => void;
}

export const MemberManagement: React.FC<MemberManagementProps> = ({ currentProject, user, onUpdateRole, onRemoveMember }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Filter members
    const filteredMembers = currentProject.members.filter(m => 
        m.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.userId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Stats
    const totalMembers = currentProject.members.length;
    const adminCount = currentProject.members.filter(m => m.role === 'Admin').length;
    const participantCount = currentProject.members.filter(m => m.role === 'Participant').length;

    // Check if current user is admin (Double check for safety)
    const currentUserRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    if (currentUserRole !== 'Admin') {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-white rounded-xl border border-dashed border-slate-300 p-12">
                <Shield size={48} className="mb-4 opacity-20 text-red-500" />
                <p className="text-lg font-bold text-slate-700">접근 제한 (Access Denied)</p>
                <p className="text-sm">이 페이지는 프로젝트 관리자(Admin)만 접근할 수 있습니다.</p>
            </div>
        );
    }

    const handleCopyInvite = () => {
        const inviteText = `[RebarMaster Pro] 프로젝트 초대장\n\n📌 프로젝트: ${currentProject.name}\n🔑 초대 코드: ${currentProject.inviteCode || 'N/A'}\n\n🔗 접속 링크: ${window.location.origin}\n\n* 위 링크로 접속하여 초대 코드를 입력하면 '참여자' 권한으로 프로젝트에 참여할 수 있습니다.`;
        navigator.clipboard.writeText(inviteText);
        alert('초대장이 클립보드에 복사되었습니다!');
        setShowInviteModal(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
             <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">구성원 관리 (Member Management)</h2>
                    <p className="text-slate-500">프로젝트 멤버 목록 확인, 권한 설정 및 삭제</p>
                </div>
                <button 
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all shadow-md font-medium"
                >
                    <Share2 size={18} /> 새 멤버 초대
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-500 mb-1 font-bold">Total Members</p>
                        <h3 className="text-3xl font-bold text-slate-800">{totalMembers}</h3>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-full text-slate-600">
                        <Users size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-blue-500 mb-1 font-bold">Admins</p>
                        <h3 className="text-3xl font-bold text-blue-600">{adminCount}</h3>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                        <Shield size={24} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-green-500 mb-1 font-bold">Participants</p>
                        <h3 className="text-3xl font-bold text-green-600">{participantCount}</h3>
                    </div>
                    <div className="p-3 bg-green-50 rounded-full text-green-600">
                        <UserCog size={24} />
                    </div>
                </div>
            </div>

            {/* Member List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-700">멤버 목록 ({filteredMembers.length})</h3>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="이름 또는 이메일 검색..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-slate-500 font-medium border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4">사용자 (User)</th>
                                <th className="px-6 py-4">계정 (ID/Email)</th>
                                <th className="px-6 py-4">가입일 (Joined)</th>
                                <th className="px-6 py-4">권한 (Role)</th>
                                <th className="px-6 py-4 text-center">관리 (Manage)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredMembers.map((member) => (
                                <tr key={member.userId} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                                                {member.userName.substring(0, 1)}
                                            </div>
                                            <span className="font-medium text-slate-800">{member.userName}</span>
                                            {member.userId === user.email && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">ME</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 font-mono">{member.userId}</td>
                                    <td className="px-6 py-4 text-slate-500">{new Date(member.joinedAt).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <select 
                                            value={member.role}
                                            onChange={(e) => onUpdateRole(currentProject.id, member.userId, e.target.value as ProjectRole)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm outline-none cursor-pointer transition-colors ${
                                                member.role === 'Admin' ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' :
                                                member.role === 'Participant' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' :
                                                'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                            }`}
                                            disabled={member.userId === user.email} // Prevent changing own role here to prevent lockout
                                        >
                                            <option value="Admin">관리자 (Admin)</option>
                                            <option value="Participant">참여자 (Participant)</option>
                                            <option value="Guest">게스트 (Guest)</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button 
                                            onClick={() => {
                                                if (window.confirm(`${member.userName}님을 프로젝트에서 제외하시겠습니까?`)) {
                                                    onRemoveMember(currentProject.id, member.userId);
                                                }
                                            }}
                                            className="text-slate-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                                            title="멤버 삭제 (Kick)"
                                            disabled={member.userId === user.email}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredMembers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-400">
                                        검색 결과가 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Invite Modal (Reused Logic) */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Share2 size={18} className="text-blue-600"/> 프로젝트 초대
                            </h3>
                            <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="text-center space-y-2">
                                <p className="text-slate-500 text-sm">동료에게 아래 코드를 공유하세요.</p>
                                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex flex-col items-center gap-2">
                                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Invite Code</span>
                                    <span className="text-3xl font-mono font-bold text-slate-800 tracking-wider select-all">{currentProject.inviteCode}</span>
                                </div>
                            </div>

                            <button 
                                onClick={handleCopyInvite}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                            >
                                <Share2 size={18} /> 초대장 복사하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
