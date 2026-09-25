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

// ---- Driver: going online in an area, and offline again ----

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: async () => (await api.get('/zones')).zones,
    staleTime: Infinity,
  });
}

export function useGoOnline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (zoneId) => api.post('/driver/online', { zoneId }),
    onSuccess: ({ vehicle }) => queryClient.setQueryData(['driver', 'vehicle'], vehicle),
  });
}

export function useGoOffline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/driver/offline'),
    onSuccess: ({ vehicle }) => queryClient.setQueryData(['driver', 'vehicle'], vehicle),
  });
}

// ---- Driver: passengers waiting for a car (refetched by live updates) ----

export function useDriverRequests({ enabled }) {
  return useQuery({
    queryKey: ['driver', 'requests'],
    queryFn: async () => (await api.get('/driver/requests')).requests,
    enabled,
  });
}

// ---- Passenger: searching places by name (stands and landmarks) ----

export function usePlaceSearch(text) {
  const query = text.trim();
  return useQuery({
    queryKey: ['places', query],
    queryFn: async () => (await api.get(`/places?q=${encodeURIComponent(query)}`)).places,
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
}
