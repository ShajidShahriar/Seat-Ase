'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api.js';

// ---- Who is logged in (null when nobody is) ----

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user } = await api.get('/auth/me');
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

// ---- Logging in and out ----

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials),
    onSuccess: ({ user }) => queryClient.setQueryData(['me'], user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
    },
  });
}

// ---- Signing up and verifying the phone ----

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details) => api.post('/auth/signup', details),
    onSuccess: ({ user }) => queryClient.setQueryData(['me'], user),
  });
}

export function useSendOtp() {
  return useMutation({ mutationFn: () => api.post('/auth/otp/send') });
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code) => api.post('/auth/otp/verify', { code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

// ---- Driver: the vehicle (null until they add one) ----

export function useVehicle() {
  return useQuery({
    queryKey: ['driver', 'vehicle'],
    queryFn: async () => {
      try {
        const { vehicle } = await api.get('/driver/vehicle');
        return vehicle;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useAddVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details) => api.post('/driver/vehicle', details),
    onSuccess: ({ vehicle }) => queryClient.setQueryData(['driver', 'vehicle'], vehicle),
  });
}
