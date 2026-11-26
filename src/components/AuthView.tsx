import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  Appointment,
  RegisteredUser,
  UserRole,
  UserSession,
} from '../types/scheduling';
import { formatPhoneBR } from '../utils/timeSlots';
import { signInWithGoogle } from '../firebase';
import { processAndUploadImageFile } from '../utils/imageUpload';
import { FIRM_INFO } from '../data/seedData';

export type AuthMode = 'login' | 'register' | 'forgot-password' | 'profile';

interface AuthViewProps {
  registeredUsers: RegisteredUser[];
  currentUser: UserSession | null;
  appointments?: Appointment[];
  initialMode?: AuthMode;
  onLoginSuccess: (user: UserSession) => void;
  onRegisterUser: (
    userData: Omit<RegisteredUser, 'id' | 'createdAt'>
  ) => { success: boolean; error?: string };
  onUpdateProfile?: (
    userId: string,
    updates: {
      name: string;
      email: string;
      phone: string;
      oab?: string;
      avatarUrl?: string;
      newPassword?: string;
    }
  ) => { success: boolean; error?: string };
  onResetPassword?: (
    identifier: string,
    phoneVerify: string,
    newPassword: string
  ) => { success: boolean; error?: string; userEmail?: string };
  onLogout?: () => void;
  onBackToBooking: () => void;
  onOpenMyAgenda?: () => void;
  onOpenAdmin?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  registeredUsers,
  currentUser,
  appointments = [],
  initialMode,
  onLoginSuccess,
  onRegisterUser,
  onUpdateProfile,
  onResetPassword,
  onLogout,
  onBackToBooking,
  onOpenMyAgenda,
  onOpenAdmin,
}) => {
  const [mode, setMode] = useState<AuthMode>(() => {
    if (initialMode) return initialMode;
    return currentUser ? 'profile' : 'login';
  });

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    } else if (currentUser && mode === 'login') {
      setMode('profile');
    }
  }, [currentUser, initialMode]);

  // --- Estados de Login ---
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccessMsg, setLoginSuccessMsg] = useState<string | null>(null);

  // --- Estados de Cadastro ---
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('staff');
  const [regOab, setRegOab] = useState('');
  const [regAvatarUrl, setRegAvatarUrl] = useState('');
  const [isUploadingRegPhoto, setIsUploadingRegPhoto] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // --- Estados de Recuperação de Senha ---
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetPhoneVerify, setResetPhoneVerify] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // --- Estados de Edição de Perfil ---
  const [profName, setProfName] = useState(currentUser?.name || '');
  const [profEmail, setProfEmail] = useState(currentUser?.email || '');
  const [profPhone, setProfPhone] = useState(currentUser?.phone || '');
  const [profOab, setProfOab] = useState(currentUser?.oab || '');
  const [profAvatarUrl, setProfAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [isUploadingProfPhoto, setIsUploadingProfPhoto] = useState(false);
  const [profNewPassword, setProfNewPassword] = useState('');
  const [profConfirmPassword, setProfConfirmPassword] = useState('');
  const [showProfPassword, setShowProfPassword] = useState(false);
  const [profError, setProfError] = useState<string | null>(null);
  const [profSaved, setProfSaved] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfName(currentUser.name);
      setProfEmail(currentUser.email);
      setProfPhone(currentUser.phone);
      setProfOab(currentUser.oab || '');
      setProfAvatarUrl(currentUser.avatarUrl || '');
      setProfNewPassword('');
      setProfConfirmPassword('');
    }
  }, [currentUser]);

  const handleRegPhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRegError(null);
    setIsUploadingRegPhoto(true);
    try {
      const uploadedUrl = await processAndUploadImageFile(file, {
        maxWidth: 320,
        maxHeight: 320,
        prefix: 'avatar',
      });
      setRegAvatarUrl(uploadedUrl);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    } finally {
      setIsUploadingRegPhoto(false);
      e.target.value = '';
    }
  };

  const handleProfPhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfError(null);
    setIsUploadingProfPhoto(true);
    try {
      const uploadedUrl = await processAndUploadImageFile(file, {
        maxWidth: 320,
        maxHeight: 320,
        prefix: 'avatar',
      });
      setProfAvatarUrl(uploadedUrl);
    } catch (err) {
      setProfError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    } finally {
      setIsUploadingProfPhoto(false);
      e.target.value = '';
    }
  };

  const findUserByIdentifier = (
    rawIdentifier: string
  ): RegisteredUser | undefined => {
    const trimmed = rawIdentifier.trim().toLowerCase();
    if (!trimmed) return undefined;
    const digits = trimmed.replace(/\D/g, '');

    return registeredUsers.find((u) => {
      if (u.email.trim().toLowerCase() === trimmed) return true;
      if (digits.length >= 8) {
        const userPhoneDigits = u.phone.replace(/\D/g, '');
        if (
          userPhoneDigits === digits ||
          (digits.length >= 9 && userPhoneDigits.endsWith(digits.slice(-9)))
        ) {
          return true;
        }
      }
      return false;
    });
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSuccessMsg(null);

    if (!loginIdentifier.trim()) {
      setLoginError('Informe seu e-mail ou telefone cadastrado.');
      return;
    }
    if (!loginPassword) {
      setLoginError('Digite sua senha para entrar.');
      return;
    }

    const matchedUser = findUserByIdentifier(loginIdentifier);
    if (!matchedUser) {
      setLoginError(
        'Nenhuma conta encontrada com este e-mail ou telefone. Use os acessos rápidos acima ou crie uma conta.'
      );
      return;
    }

    if (matchedUser.password !== loginPassword) {
      setLoginError(
        `Senha incorreta para a conta de ${matchedUser.name.split(' ')[0]}.`
      );
      return;
    }

    onLoginSuccess({
      id: matchedUser.id,
      name: matchedUser.name,
      email: matchedUser.email,
      phone: matchedUser.phone,
      role: matchedUser.role,
      oab: matchedUser.oab,
      avatarUrl: matchedUser.avatarUrl,
      firmName: FIRM_INFO.name,
    });
  };

  const handleQuickLogin = (user: RegisteredUser) => {
    setLoginError(null);
    setLoginIdentifier(user.email);
    setLoginPassword(user.password);
    onLoginSuccess({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      oab: user.oab,
      avatarUrl: user.avatarUrl,
      firmName: FIRM_INFO.name,
    });
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    setRegError(null);
    try {
      const fbUser = await signInWithGoogle();
      const email = (fbUser.email || '').trim().toLowerCase();
      const existing = registeredUsers.find(
        (u) => u.email.trim().toLowerCase() === email
      );
      const isMasterEmail =
        email === 'jm783311@gmail.com' ||
        email === 'master@fernandeslins.adv.br';
      const role: UserRole = existing?.role || (isMasterEmail ? 'master' : 'staff');
      const phone = existing?.phone || '(81) 99810-4002';
      const name =
        existing?.name || fbUser.displayName || email.split('@')[0] || 'Equipe';
      const avatarUrl = existing?.avatarUrl || fbUser.photoURL || undefined;

      if (!existing && email) {
        onRegisterUser({
          name,
          email,
          phone,
          password: `google-${fbUser.uid.slice(0, 8)}`,
          role,
          avatarUrl,
        });
        return;
      }

      onLoginSuccess({
        id: existing?.id || fbUser.uid,
        name,
        email: email || 'equipe@fernandeslins.adv.br',
        phone,
        role,
        oab: existing?.oab,
        avatarUrl,
        firmName: FIRM_INFO.name,
      });
    } catch {
      setLoginError(
        'Não foi possível concluir o login com Google agora. Use uma das contas Master/Funcionário abaixo.'
      );
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (regName.trim().length < 3) {
      setRegError('Informe o nome completo (mínimo 3 caracteres).');
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setRegError('Informe um endereço de e-mail válido.');
      return;
    }

    if (regPhone.replace(/\D/g, '').length < 10) {
      setRegError('Informe um WhatsApp/telefone válido com DDD.');
      return;
    }

    if (regPassword.length < 4) {
      setRegError('A senha deve ter pelo menos 4 caracteres.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError('As senhas digitadas não conferem.');
      return;
    }

    const result = onRegisterUser({
      name: regName.trim(),
      email: cleanEmail,
      phone: formatPhoneBR(regPhone),
      password: regPassword,
      role: regRole,
      oab: regOab.trim() || undefined,
      avatarUrl: regAvatarUrl.trim() || undefined,
    });

    if (!result.success && result.error) {
      setRegError(result.error);
    }
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (!resetIdentifier.trim()) {
      setResetError('Informe o e-mail ou telefone da conta.');
      return;
    }
    const verifyDigits = resetPhoneVerify.replace(/\D/g, '');
    if (verifyDigits.length < 4) {
      setResetError('Informe os 4 últimos dígitos do telefone cadastrado.');
      return;
    }
    if (resetNewPassword.length < 4) {
      setResetError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('A confirmação da nova senha não confere.');
      return;
    }

    if (onResetPassword) {
      const res = onResetPassword(
        resetIdentifier.trim(),
        verifyDigits,
        resetNewPassword
      );
      if (!res.success) {
        setResetError(res.error || 'Não foi possível validar os dados.');
        return;
      }
      setMode('login');
      setLoginIdentifier(res.userEmail || resetIdentifier.trim());
      setLoginPassword(resetNewPassword);
      setLoginError(null);
      setLoginSuccessMsg('Senha redefinida com sucesso! Clique em Entrar.');
      setResetNewPassword('');
      setResetConfirmPassword('');
    }
  };

  const handleProfileUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !onUpdateProfile) return;
    setProfError(null);
    setProfSaved(false);

    if (profName.trim().length < 3) {
      setProfError('O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profEmail.trim())) {
      setProfError('Informe um e-mail válido.');
      return;
    }
    if (profPhone.replace(/\D/g, '').length < 10) {
      setProfError('Informe um telefone válido com DDD.');
      return;
    }
    if (profNewPassword) {
      if (profNewPassword.length < 4) {
        setProfError('A nova senha deve ter pelo menos 4 caracteres.');
        return;
      }
      if (profNewPassword !== profConfirmPassword) {
        setProfError('A confirmação da nova senha não confere.');
        return;
      }
    }

    const res = onUpdateProfile(currentUser.id, {
      name: profName.trim(),
      email: profEmail.trim().toLowerCase(),
      phone: formatPhoneBR(profPhone),
      oab: profOab.trim() || undefined,
      avatarUrl: profAvatarUrl.trim() || undefined,
      newPassword: profNewPassword || undefined,
    });

    if (!res.success) {
      setProfError(res.error || 'Erro ao atualizar perfil.');
      return;
    }

    setProfNewPassword('');
    setProfConfirmPassword('');
    setProfSaved(true);
    setTimeout(() => setProfSaved(false), 4000);
  };

  const masterAccount = registeredUsers.find((u) => u.role === 'master');
  const staffAccounts = registeredUsers
    .filter((u) => u.role === 'staff')
    .slice(0, 2);

  return (
    <div className="max-w-[1140px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToBooking}
          className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-bold text-[#0B2545] hover:text-[#1D4ED8] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Recepção &amp; Agenda</span>
        </button>

        {currentUser && (
          <p className="text-xs font-medium text-[#0B2545]">
            Sessão ativa: <strong>{currentUser.name}</strong> ·{' '}
            {currentUser.role === 'master' ? 'Conta Master' : 'Conta Funcionário'}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Coluna Esquerda: Formulário Principal */}
        <div className="lg:col-span-7 p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-2.5">
              <BrandMark size="md" variant="navy" />
              <div>
                <span className="font-editorial font-bold text-lg text-[#0B2545] block leading-none">
                  {FIRM_INFO.shortName}
                </span>
                <span className="text-[11px] text-slate-500">
                  Acesso Master &amp; Secretaria
                </span>
              </div>
            </div>

            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              {currentUser && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('profile');
                    setProfError(null);
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    mode === 'profile'
                      ? 'bg-[#0B2545] text-white'
                      : 'text-slate-600 hover:text-[#0B2545]'
                  }`}
                >
                  Minha Conta
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setLoginError(null);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'login' || mode === 'forgot-password'
                    ? 'bg-[#0B2545] text-white'
                    : 'text-slate-600 hover:text-[#0B2545]'
                }`}
              >
                {currentUser ? 'Trocar Conta' : 'Entrar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setRegError(null);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#0B2545] text-white'
                    : 'text-slate-600 hover:text-[#0B2545]'
                }`}
              >
                Cadastrar Conta
              </button>
            </div>
          </div>

          {/* MODO 1: PERFIL LOGADO */}
          {mode === 'profile' && currentUser && (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6 pb-5 border-b border-slate-200">
                <div className="flex items-center gap-3.5">
                  {profAvatarUrl || currentUser.avatarUrl ? (
                    <img
                      src={profAvatarUrl || currentUser.avatarUrl}
                      alt={currentUser.name}
                      className="w-14 h-14 rounded-2xl object-cover border border-slate-300 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-[#0B2545] text-[#FACC15] flex items-center justify-center text-lg font-bold shrink-0">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-bold text-[#0B2545]">
                      {currentUser.name}
                    </h1>
                    <p className="text-xs font-semibold text-[#1D4ED8] mt-0.5">
                      {currentUser.role === 'master'
                        ? 'Conta Master (Acesso Total)'
                        : 'Conta Funcionário / Secretaria'}
                      {currentUser.oab ? ` · ${currentUser.oab}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {currentUser.email} · {currentUser.phone}
                    </p>
                  </div>
                </div>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      onLogout();
                      setMode('login');
                    }}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {onOpenMyAgenda && (
                  <button
                    type="button"
                    onClick={onOpenMyAgenda}
                    className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 flex items-center justify-between text-left cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-bold text-[#0B2545]">
                        Pauta Geral do Escritório
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {appointments.length} atendimento(s) registrado(s)
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#134074]" />
                  </button>
                )}

                {onOpenAdmin && (
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="p-3.5 rounded-xl bg-[#0B2545] hover:bg-[#134074] text-white flex items-center justify-between text-left cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">
                        {currentUser.role === 'master'
                          ? 'Painel Master Completo'
                          : 'Painel Operacional Secretaria'}
                      </p>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {currentUser.role === 'master'
                          ? 'Áreas, horários, equipe e relatórios'
                          : 'Gerenciar atendimentos e status'}
                      </p>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-[#FACC15]" />
                  </button>
                )}
              </div>

              <h2 className="text-sm font-bold text-[#0B2545] mb-3">
                Atualizar Dados Cadastrais &amp; Foto
              </h2>

              {profError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{profError}</span>
                </div>
              )}

              {profSaved && (
                <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-[#0B2545] flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                  <span>Dados e foto salvos com sucesso.</span>
                </div>
              )}

              <form
                onSubmit={handleProfileUpdateSubmit}
                className="space-y-4"
                noValidate
              >
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {profAvatarUrl ? (
                      <img
                        src={profAvatarUrl}
                        alt="Foto"
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-[#0B2545] shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-white border border-dashed border-slate-300 text-[#134074] flex items-center justify-center shrink-0">
                        <Camera className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold text-[#0B2545]">
                        Foto do Usuário
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {isUploadingProfPhoto
                          ? 'Enviando foto...'
                          : 'JPG, PNG ou WebP'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B2545] hover:bg-[#134074] text-white text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{profAvatarUrl ? 'Trocar Foto' : 'Adicionar Foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfPhotoFileChange}
                        className="hidden"
                      />
                    </label>
                    {profAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setProfAvatarUrl('')}
                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-[#0B2545] mb-1.5">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#134074] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B2545] mb-1.5">
                      E-mail *
                    </label>
                    <input
                      type="email"
                      value={profEmail}
                      onChange={(e) => setProfEmail(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#134074] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#0B2545] mb-1.5">
                      Telefone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      value={profPhone}
                      onChange={(e) => setProfPhone(formatPhoneBR(e.target.value))}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-tabular focus:border-[#134074] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <input
                      type={showProfPassword ? 'text' : 'password'}
                      value={profNewPassword}
                      onChange={(e) => setProfNewPassword(e.target.value)}
                      placeholder="Nova senha (opcional)"
                      className="w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#134074] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowProfPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showProfPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type={showProfPassword ? 'text' : 'password'}
                    value={profConfirmPassword}
                    onChange={(e) => setProfConfirmPassword(e.target.value)}
                    placeholder="Confirmar nova senha"
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#134074] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] py-3 px-5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </form>
            </div>
          )}

          {/* MODO 2: LOGIN */}
          {mode === 'login' && (
            <div>
              <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#0B2545]">
                Acesso ao Escritório
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 mb-6">
                Selecione uma das 2 contas do escritório (<strong>Master</strong> ou{' '}
                <strong>Funcionário / Secretaria</strong>) ou informe suas credenciais.
              </p>

              {/* Contas Rápidas: Master e Funcionário + Google */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#0B2545] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    Contas do Sistema (Acesso Direto)
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {masterAccount && (
                    <button
                      type="button"
                      onClick={() => handleQuickLogin(masterAccount)}
                      className="text-left p-3.5 rounded-xl bg-[#0B2545] hover:bg-[#134074] text-white transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FACC15]">
                          <ShieldCheck className="w-4 h-4" />
                          Conta Master
                        </span>
                        <span className="text-[11px] font-semibold text-slate-200">
                          Entrar →
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white truncate">
                        {masterAccount.name}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-slate-300 truncate mt-0.5">
                        {masterAccount.email}
                      </p>
                    </button>
                  )}

                  {staffAccounts.map((staff) => (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => handleQuickLogin(staff)}
                      className="text-left p-3.5 rounded-xl bg-white hover:bg-[#EFF6FF] border-2 border-[#134074]/30 hover:border-[#134074] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B2545]">
                          <Briefcase className="w-4 h-4 text-[#1D4ED8]" />
                          Conta Funcionário
                        </span>
                        <span className="text-[11px] font-semibold text-[#1D4ED8]">
                          Entrar →
                        </span>
                      </div>
                      <p className="text-xs font-bold text-[#0F172A] truncate">
                        {staff.name}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-slate-600 truncate mt-0.5">
                        {staff.email}
                      </p>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="sm:col-span-2 text-left p-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span className="text-xs font-bold text-[#0B2545]">
                      Entrar com Conta Google (Firebase Auth)
                    </span>
                    <span className="text-xs font-semibold text-[#1D4ED8]">
                      Conectar →
                    </span>
                  </button>
                </div>
              </div>

              {loginSuccessMsg && (
                <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-[#0B2545] flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                  <span>{loginSuccessMsg}</span>
                </div>
              )}

              {loginError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-bold text-[#0B2545] mb-1.5"
                  >
                    E-mail ou Telefone *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-identifier"
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => {
                        setLoginIdentifier(e.target.value);
                        if (loginError) setLoginError(null);
                      }}
                      placeholder="master@fernandeslins.adv.br ou secretaria@fernandeslins.adv.br"
                      className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#134074] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-bold text-[#0B2545]"
                    >
                      Senha *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetIdentifier(loginIdentifier);
                        setResetError(null);
                        setMode('forgot-password');
                      }}
                      className="text-xs font-semibold text-[#1D4ED8] hover:underline cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        if (loginError) setLoginError(null);
                      }}
                      placeholder="Digite sua senha"
                      className="w-full min-h-[46px] pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#134074] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] py-3 px-5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Entrar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* MODO 3: RECUPERAR SENHA */}
          {mode === 'forgot-password' && (
            <div>
              <h1 className="font-editorial text-2xl font-bold text-[#0B2545]">
                Redefinir Senha
              </h1>
              <p className="text-xs text-slate-600 mt-1 mb-5">
                Informe o e-mail da conta e os 4 últimos dígitos do telefone cadastrado.
              </p>

              {resetError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <input
                  type="text"
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="E-mail ou telefone da conta"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  type="text"
                  value={resetPhoneVerify}
                  onChange={(e) => setResetPhoneVerify(e.target.value)}
                  placeholder="4 últimos dígitos do WhatsApp/telefone"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-tabular"
                />
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Nova senha"
                    className="w-full min-h-[46px] pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                  >
                    {showResetPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Confirmar nova senha"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
                <button
                  type="submit"
                  className="w-full min-h-[48px] py-3 rounded-xl bg-[#0B2545] text-white font-bold text-sm cursor-pointer"
                >
                  Confirmar Nova Senha
                </button>
              </form>
            </div>
          )}

          {/* MODO 4: CADASTRAR NOVA CONTA (COM FOTO) */}
          {mode === 'register' && (
            <div>
              <h1 className="font-editorial text-2xl font-bold text-[#0B2545]">
                Cadastrar Conta da Equipe
              </h1>
              <p className="text-xs text-slate-600 mt-1 mb-5">
                Crie um perfil Master ou Funcionário (Secretaria) com foto.
              </p>

              {regError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {regAvatarUrl ? (
                      <img
                        src={regAvatarUrl}
                        alt="Preview"
                        className="w-12 h-12 rounded-xl object-cover border border-[#0B2545]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-white border border-dashed border-slate-300 text-[#134074] flex items-center justify-center">
                        <Camera className="w-5 h-5" />
                      </div>
                    )}
                    <div className="text-xs">
                      <p className="font-bold text-[#0B2545]">Foto do Cadastro</p>
                      <p className="text-slate-500">
                        {isUploadingRegPhoto ? 'Enviando...' : 'Opcional (JPG/PNG)'}
                      </p>
                    </div>
                  </div>
                  <label className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B2545] text-white text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{regAvatarUrl ? 'Trocar' : 'Adicionar Foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleRegPhotoFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRegRole('staff')}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                      regRole === 'staff'
                        ? 'bg-[#0B2545] text-white border-[#0B2545]'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Funcionário / Secretaria
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegRole('master')}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                      regRole === 'master'
                        ? 'bg-[#0B2545] text-[#FACC15] border-[#0B2545]'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Master / Advogado
                  </button>
                </div>

                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Nome completo *"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="E-mail *"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(formatPhoneBR(e.target.value))}
                    placeholder="WhatsApp (81) 99999-9999 *"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-tabular"
                  />
                </div>

                {regRole === 'master' && (
                  <input
                    type="text"
                    value={regOab}
                    onChange={(e) => setRegOab(e.target.value)}
                    placeholder="Registro OAB (opcional, ex: OAB/PE 41.820)"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Senha (mín. 4) *"
                      className="w-full min-h-[46px] pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                    >
                      {showRegPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Confirmar senha *"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] py-3 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#0B2545] font-bold text-sm cursor-pointer"
                >
                  Criar Conta e Acessar
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Coluna Direita: Resumo das Permissões Master vs Funcionário */}
        <div className="lg:col-span-5 fl-navy-banner text-white p-6 sm:p-10 flex flex-col justify-between gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#FACC15] mb-3">
              Estrutura de Acesso · {FIRM_INFO.shortName}
            </p>
            <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-white leading-tight">
              Duas contas dedicadas para recepção ágil e governança do escritório.
            </h2>

            <div className="mt-6 space-y-4 text-xs sm:text-sm">
              <div className="p-4 rounded-xl bg-white/10 border border-white/15">
                <p className="font-bold text-[#FACC15] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  1. Conta Master (Sócios / Gestores)
                </p>
                <p className="text-slate-200 mt-1.5 leading-relaxed">
                  Administra áreas jurídicas, advogados, horários de expediente, bloqueios de recesso, contas de funcionários e relatórios financeiros.
                </p>
                <p className="font-mono-tabular text-[11px] text-slate-300 mt-2">
                  master@fernandeslins.adv.br · senha: master123
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/10 border border-white/15">
                <p className="font-bold text-white flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-[#FACC15]" />
                  2. Conta Funcionário (Secretaria / Recepção)
                </p>
                <p className="text-slate-200 mt-1.5 leading-relaxed">
                  Consulta a agenda livre dos advogados, cadastra clientes presenciais com CPF e endereço, registra o caso completo com PDFs ou assunto breve e acompanha comparecimentos.
                </p>
                <p className="font-mono-tabular text-[11px] text-slate-300 mt-2">
                  secretaria@fernandeslins.adv.br · senha: func123
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/15 text-xs text-slate-300">
            <p className="font-semibold text-white">{FIRM_INFO.name}</p>
            <p className="mt-0.5">{FIRM_INFO.address}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
